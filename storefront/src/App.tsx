import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { storeApi, PublicCatalogSearchMeta } from './services/api';
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
import { PharmacistChatWidget } from './components/PharmacistChatWidget';

export const App: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [rxFilter, setRxFilter] = useState<'ALL' | 'OTC' | 'RX'>('ALL');
  const [symptomFilter, setSymptomFilter] = useState<string>('ALL_SYMPTOM');
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [searchMeta, setSearchMeta] = useState<PublicCatalogSearchMeta | undefined>(undefined);
  const [cart, setCart] = useState<CartItem[]>([]);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [consultModal, setConsultModal] = useState<{
    open: boolean;
    mode: 'RX' | 'B2B_QUOTE';
  }>({ open: false, mode: 'RX' });
  const [trackingState, setTrackingState] = useState<{
    open: boolean;
    orderCode: string;
    trackingToken: string;
  }>({ open: false, orderCode: '', trackingToken: '' });
  const [chatOpen, setChatOpen] = useState<boolean>(false);
  const [chatContextProduct, setChatContextProduct] = useState<Product | null>(null);
  const [queuedChatQuestion, setQueuedChatQuestion] = useState<{ id: number; text: string } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await storeApi.getProducts({
        page,
        limit: 12,
        search: debouncedSearch || undefined,
        type: selectedCategory !== 'ALL' ? selectedCategory : undefined,
        rxFilter: rxFilter !== 'ALL' ? rxFilter : undefined,
        symptom: symptomFilter !== 'ALL_SYMPTOM' ? symptomFilter : undefined,
      });
      setProducts(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      setSearchMeta(res.searchMeta);
      if (res.categories.length > 0) {
        setCategories(res.categories);
      }
    } catch {
      toast.error('Không thể tải danh mục thuốc từ máy chủ. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, selectedCategory, rxFilter, symptomFilter]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

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
        toast.warning(`Tồn kho khả dụng tối đa ${maxAvail} ${unitName}/đơn.`);
        return;
      }
      setCart((prev) =>
        prev.map((item) =>
          item.product.ProductID === product.ProductID && item.unitMode === mode
            ? {
                ...item,
                quantity: nextQty,
                unitPrice: getEffectivePrice(product, mode),
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
        unitPrice: getEffectivePrice(product, mode),
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
            toast.warning(`Số lượng tối đa/đơn là ${maxAvail} ${item.unit}.`);
            return item;
          }
          return {
            ...item,
            quantity: nextQty,
            unitPrice: getEffectivePrice(item.product, unitMode),
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
        onOpenCart={() => setIsCartOpen(true)}
        onOpenPrescriptionModal={() => setConsultModal({ open: true, mode: 'RX' })}
        onOpenB2BQuoteModal={() => setConsultModal({ open: true, mode: 'B2B_QUOTE' })}
        onOpenTrackingModal={() =>
          setTrackingState({ open: true, orderCode: '', trackingToken: '' })
        }
      />

      <div className="flex-1">
        <HomePage
          products={products}
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={(cat) => {
            setSelectedCategory(cat);
            setPage(1);
          }}
          rxFilter={rxFilter}
          onChangeRxFilter={(nextRx) => {
            setRxFilter(nextRx);
            setPage(1);
          }}
          symptomFilter={symptomFilter}
          onChangeSymptomFilter={(nextSym) => {
            setSymptomFilter(nextSym);
            setPage(1);
          }}
          page={page}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          loading={loading}
          search={search}
          searchMeta={searchMeta}
          onRefresh={() => void loadProducts()}
          onSelectProduct={(p) => setSelectedProduct(p)}
          onQuickAdd={(p) => handleAddToCart(p, 'BASE', 1)}
          onOpenPrescriptionModal={() => setConsultModal({ open: true, mode: 'RX' })}
          onOpenB2BQuoteModal={() => setConsultModal({ open: true, mode: 'B2B_QUOTE' })}
          onOpenTrackingModal={() =>
            setTrackingState({ open: true, orderCode: '', trackingToken: '' })
          }
          onOpenAiChat={() => setChatOpen(true)}
        />
      </div>

      <Footer />

      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={handleAddToCart}
          onOpenPrescriptionModal={() => {
            setSelectedProduct(null);
            setConsultModal({ open: true, mode: 'RX' });
          }}
          onAskAiAboutProduct={(prod) => {
            setSelectedProduct(null);
            setChatContextProduct(prod);
            setChatOpen(true);
            setQueuedChatQuestion({
              id: Date.now(),
              text: `Cho tôi hỏi công dụng, liều dùng và lưu ý an toàn của "${prod.ProductName}" là gì?`,
            });
          }}
        />
      )}

      {consultModal.open && (
        <PrescriptionUploadModal
          initialMode={consultModal.mode}
          onClose={() => setConsultModal({ open: false, mode: 'RX' })}
        />
      )}

      {trackingState.open && (
        <OrderTrackingModal
          initialOrderCode={trackingState.orderCode}
          initialTrackingToken={trackingState.trackingToken}
          onClose={() => setTrackingState({ open: false, orderCode: '', trackingToken: '' })}
          onOrderCancelled={() => void loadProducts()}
        />
      )}

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        onUpdateQty={handleUpdateQty}
        onRemoveItem={handleRemoveItem}
        onClearCart={() => setCart([])}
        onOrderSuccess={() => void loadProducts()}
        onOpenB2BQuoteModal={() => setConsultModal({ open: true, mode: 'B2B_QUOTE' })}
        onTrackOrder={(orderCode, trackingToken) => {
          setIsCartOpen(false);
          setTrackingState({ open: true, orderCode, trackingToken });
        }}
      />

      <PharmacistChatWidget
        isOpen={chatOpen}
        onOpenChange={setChatOpen}
        contextProduct={chatContextProduct}
        onClearContextProduct={() => setChatContextProduct(null)}
        queuedQuestion={queuedChatQuestion}
        onSelectProduct={(prod) => {
          setChatOpen(false);
          setSelectedProduct(prod);
        }}
        onAddToCart={(prod) => handleAddToCart(prod, 'BASE', 1)}
        onOpenPrescriptionModal={() => {
          setChatOpen(false);
          setConsultModal({ open: true, mode: 'RX' });
        }}
        hideLauncher={isCartOpen || Boolean(selectedProduct) || consultModal.open || trackingState.open}
      />
    </div>
  );
};

export default App;
