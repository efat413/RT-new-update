-- Migration 0009: Composite indexes for server-side paginated order filtering and sorting
CREATE INDEX IF NOT EXISTS idx_orders_shipping_status_created_at ON orders(shipping_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status_created_at ON orders(payment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_payment_method_created_at ON orders(payment_method, created_at DESC);
