import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { storeApi } from './services/api';
import { CartItem, Product, UnitMode } from './types';
import {
  getEffectivePrice,
  getMaxStockForMode,
  getUnitName,
} from './utils/packaging';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { HomePage } from './pages/HomePage';
import { ProductDetailModal } from './components/ProductDetailModal';
import { PrescriptionUploadModal } from './components/PrescriptionUploadModal';
import { OrderTrackingModal } from './components/OrderTrackingModal';
import { CartDrawer } from './components/CartDrawer';

export const App: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [buyerMode, setBuyerMode] = useState<'RETAIL' | 'WHOLESALE'>('RETAIL');
  const [cart, setCart] = useState<CartItem[]>([]);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isRxModalOpen, setIsRxModalOpen] = useState<boolean>(false);
  const [trackingState, setTrackingState] = useState<{
    open: boolean;
    orderCode: string;
    phoneOrToken: string;
  }>({ open: false, orderCode: '', phoneOrToken: '' });

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await storeApi.getProducts();
      setProducts(res.items);
    } catch {
      toast.error('Không thể tải danh mục thuốc từ máy chủ. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  // Đồng bộ đơn giá trong giỏ khi khách chuyển chế độ Mua Lẻ <-> Giá Sỉ B2B
  const handleBuyerModeChange = (nextMode: 'RETAIL' | 'WHOLESALE') => {
    setBuyerMode(nextMode);
    setCart((prev) =>
      prev.map((item) => ({
        ...item,
        unitPrice: getEffectivePrice(item.product, item.unitMode, item.quantity, nextMode),
      }))
    );
  };

  const handleAddToCart = (product: Product, mode: UnitMode, quantity: number) => {
    const maxAvail = getMaxStockForMode(product, mode);
    if (maxAvail <= 0) {
      toast.error(`"${product.ProductName}" tạm hết hàng theo đơn vị đã chọn.`);
      return;
    }

    const unitName = getUnitName(product, mode);
    const existing = cart.find(
      (i) => i.product.ProductID === product.ProductID && i.unitMode === mode
    );

    if (existing) {
      const nextQty = existing.quantity + quantity;
      if (nextQty > maxAvail) {
        toast.warning(`Tồn kho khả dụng chỉ còn ${maxAvail} ${unitName}.`);
        return;
      }
      setCart((prev) =>
        prev.map((item) =>
          item.product.ProductID === product.ProductID && item.unitMode === mode
            ? {
                ...item,
                quantity: nextQty,
                unitPrice: getEffectivePrice(product, mode, nextQty, buyerMode),
              }
            : item
        )
      );
      toast.success(`Đã thêm ${quantity} ${unitName} "${product.ProductName}" vào giỏ`);
      return;
    }

    const clampedQty = Math.min(quantity, maxAvail);
    setCart((prev) => [
      ...prev,
      {
        product,
        quantity: clampedQty,
        unit: unitName,
        unitMode: mode,
        unitPrice: getEffectivePrice(product, mode, clampedQty, buyerMode),
        dosageNote: product.IsRx
          ? 'Thuốc kê đơn Rx — Dược sĩ kiểm tra toa & tư vấn trước khi giao'
          : 'Sử dụng theo hướng dẫn trên bao bì hoặc tư vấn của Dược sĩ',
      },
    ]);
    toast.success(`Đã thêm ${clampedQty} ${unitName} "${product.ProductName}" vào giỏ`);
  };

  const handleUpdateQty = (productId: number, unitMode: UnitMode, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.ProductID !== productId || item.unitMode !== unitMode) return item;
          const nextQty = item.quantity + delta;
          if (nextQty <= 0) return null;
          const maxAvail = getMaxStockForMode(item.product, unitMode);
          if (nextQty > maxAvail) {
            toast.warning(`Tồn kho khả dụng chỉ còn ${maxAvail} ${item.unit}.`);
            return item;
          }
          return {
            ...item,
            quantity: nextQty,
            unitPrice: getEffectivePrice(item.product, unitMode, nextQty, buyerMode),
          };
        })
        .filter((x): x is CartItem => Boolean(x))
    );
  };

  const handleRemoveItem = (productId: number, unitMode: UnitMode) => {
    setCart((prev) =>
      prev.filter((i) => !(i.product.ProductID === productId && i.unitMode === unitMode))
    );
  };

  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [cart]
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Toaster position="top-right" richColors />

      <Header
        search={search}
        onSearchChange={setSearch}
        cartCount={cartCount}
        cartTotal={cartTotal}
        buyerMode={buyerMode}
        onBuyerModeChange={handleBuyerModeChange}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenPrescriptionModal={() => setIsRxModalOpen(true)}
        onOpenTrackingModal={() =>
          setTrackingState({ open: true, orderCode: '', phoneOrToken: '' })
        }
      />

      <div className="flex-1">
        <HomePage
          products={products}
          loading={loading}
          search={search}
          buyerMode={buyerMode}
          onRefresh={() => void loadProducts()}
          onSelectProduct={(p) => setSelectedProduct(p)}
          onQuickAdd={(p) => handleAddToCart(p, 'BASE', 1)}
          onOpenPrescriptionModal={() => setIsRxModalOpen(true)}
          onOpenTrackingModal={() =>
            setTrackingState({ open: true, orderCode: '', phoneOrToken: '' })
          }
        />
      </div>

      <Footer />

      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          buyerMode={buyerMode}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={handleAddToCart}
          onOpenPrescriptionModal={() => {
            setSelectedProduct(null);
            setIsRxModalOpen(true);
          }}
        />
      )}

      {isRxModalOpen && <PrescriptionUploadModal onClose={() => setIsRxModalOpen(false)} />}

      {trackingState.open && (
        <OrderTrackingModal
          initialOrderCode={trackingState.orderCode}
          initialPhoneOrToken={trackingState.phoneOrToken}
          onClose={() => setTrackingState({ open: false, orderCode: '', phoneOrToken: '' })}
          onOrderCancelled={() => void loadProducts()}
        />
      )}

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        buyerMode={buyerMode}
        onUpdateQty={handleUpdateQty}
        onRemoveItem={handleRemoveItem}
        onClearCart={() => setCart([])}
        onOrderSuccess={() => void loadProducts()}
        onTrackOrder={(orderCode, phoneOrToken) => {
          setIsCartOpen(false);
          setTrackingState({ open: true, orderCode, phoneOrToken });
        }}
      />
    </div>
  );
};

export default App;
