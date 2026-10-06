-- Add CASCADE DELETE constraints for organization and tenant (outlet) deletions
-- This ensures all related records are deleted when a parent record is deleted

-- Organizations -> Tenants (outlets)
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_organization_id_fkey;
ALTER TABLE tenants ADD CONSTRAINT tenants_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- Tenants -> Orders
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_tenant_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Tenants -> Customers
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_tenant_id_fkey;
ALTER TABLE customers ADD CONSTRAINT customers_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Tenants -> Subscriptions
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_tenant_id_fkey;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Tenants -> Invoices
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_tenant_id_fkey;
ALTER TABLE invoices ADD CONSTRAINT invoices_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Tenants -> Restaurant Tables
ALTER TABLE restaurant_tables DROP CONSTRAINT IF EXISTS restaurant_tables_tenant_id_fkey;
ALTER TABLE restaurant_tables ADD CONSTRAINT restaurant_tables_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Tenants -> Outreach QR Codes
ALTER TABLE outreach_qr_codes DROP CONSTRAINT IF EXISTS outreach_qr_codes_tenant_id_fkey;
ALTER TABLE outreach_qr_codes ADD CONSTRAINT outreach_qr_codes_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Tenants -> Reviews
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_tenant_id_fkey;
ALTER TABLE reviews ADD CONSTRAINT reviews_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Tenants -> Staff Members
ALTER TABLE staff_members DROP CONSTRAINT IF EXISTS staff_members_tenant_id_fkey;
ALTER TABLE staff_members ADD CONSTRAINT staff_members_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Tenants -> Menu Categories
ALTER TABLE menu_categories DROP CONSTRAINT IF EXISTS menu_categories_tenant_id_fkey;
ALTER TABLE menu_categories ADD CONSTRAINT menu_categories_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Tenants -> Menu Items
ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS menu_items_tenant_id_fkey;
ALTER TABLE menu_items ADD CONSTRAINT menu_items_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Organizations -> Organization Users (managers)
ALTER TABLE organization_users DROP CONSTRAINT IF EXISTS organization_users_organization_id_fkey;
ALTER TABLE organization_users ADD CONSTRAINT organization_users_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- Orders -> Order Items (cascade from orders)
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_order_id_fkey;
ALTER TABLE order_items ADD CONSTRAINT order_items_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- Menu Categories -> Menu Items (cascade from categories)
ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS menu_items_category_id_fkey;
ALTER TABLE menu_items ADD CONSTRAINT menu_items_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE CASCADE;
