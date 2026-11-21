export type Frequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'special';
export type ContractStatus = 'active' | 'renewed' | 'expired' | 'terminated';
export interface Property { id: string; name: string; short: string; type: string | null; location: string | null; ownership: string | null;
  land_value: number | null; building_value: number | null; value_status: string | null; deed_no: string | null; notes: string; ground_lease_end: string | null;
  land_basis: 'owned' | 'leased' | 'land_only' | null; land_area: number | null; building_area: number | null; data_status: 'confirmed' | 'provisional'; data_source: string | null }
export interface Valuation { id: string; property_id: string; kind: 'initial' | 'revaluation'; val_date: string | null; land_value: number | null; building_value: number | null;
  prev_land: number | null; prev_building: number | null; basis: string | null; valuer: string | null; ref_no: string | null; decision_no: string | null; note: string | null; created_by: string | null; created_at: string }
export interface Unit { id: string; property_id: string; code: string; kind: 'lease' | 'subunit'; unit_type: string | null; floor: string | null;
  rooms: string | null; occupant: string | null; monthly_rent: number | null; note: string | null;
  area: number | null; elec_meter: string | null; water_meter: string | null; features: string | null; parent_id: string | null; status: string | null }
export interface Tenant { id: string; name: string; phone: string | null; national_id: string | null; email: string | null; notes: string | null;
  tenant_type: 'individual' | 'company' | null; nationality: string | null; id_expiry: string | null; cr_no: string | null; cr_expiry: string | null; vat_no: string | null;
  phone2: string | null; contact_person: string | null; address: string | null; guarantor_name: string | null; guarantor_phone: string | null; guarantor_id: string | null; collector: string | null; portal_token: string | null; notify_opt_out?: boolean }
export interface Contract { id: string; property_id: string; unit_id: string; tenant_id: string; start_date: string; end_date: string;
  annual_rent: number; frequency: Frequency | null; status: ContractStatus; contract_no: string | null; renewed_from: string | null; notes: string;
  ejar_property_id: string | null; broker: string | null; trade_name: string | null;
  usage: string | null; signed_on: string | null; deposit: number | null; deposit_status: string | null; vat_rate: number | null; escalation_pct: number | null;
  ejar_fees: number | null; brokerage: number | null; utilities: string | null; notice_days: number | null; auto_renew: boolean;
  vacated_on: string | null; handover_notes: string | null; deposit_refund: number | null; deposit_deduction: number | null }
export interface Installment { id: string; contract_id: string; no: number; period_from: string | null; period_to: string | null; due_date: string;
  amount: number; opening_paid: number; needs_confirmation: boolean; note: string;
  src_receipt: string | null; src_dates: string | null; rating: string | null; kind: string }
export interface Payment { id: string; receipt_no: string; tenant_id: string; contract_id: string | null; paid_on: string; amount: number; method: string;
  bank_ref: string | null; note: string | null; voided: boolean; void_reason: string | null; reviewed_by?: string | null; reviewed_at?: string | null; created_by: string | null; bank_line_id: string | null }
export interface Allocation { payment_id: string; installment_id: string; amount: number }
export interface Adjustment { id: string; tenant_id: string | null; property_id: string | null; contract_id: string | null; installment_id: string | null;
  installment_no: number | null; type: string; amount: number; approved_by: string | null; decision_no: string | null; date: string | null; note: string | null;
  status: 'pending' | 'approved' | 'rejected'; requested_by: string | null }
export interface FollowUp { id: string; tenant_id: string; date: string; type: string; details: string | null; next_date: string | null; created_by: string | null }
export interface Expense { id: string; property_id: string; date: string; category: string; amount: number; vendor: string | null; ref: string | null; description: string | null; created_by: string | null }
export interface AuditNote { id: string; category: string; property_id: string | null; tenant_name: string | null; unit: string | null; amount: number | null;
  ref: string | null; ref_date: string | null; source: string | null; details: string | null; status: 'open' | 'resolved'; resolution: string | null; resolved_by: string | null }
export interface DB {
  meta: { org: string; today: string; grace_days: number; opening_date: string; date_format: string; locked_until: string; features: Record<string, boolean>; settings: Record<string, string> };
  properties: Property[]; units: Unit[]; tenants: Tenant[]; contracts: Contract[]; installments: Installment[];
  payments: Payment[]; allocations: Allocation[]; adjustments: Adjustment[]; followups: FollowUp[]; expenses: Expense[]; notes: AuditNote[];
  attachments: AttachMeta[]; ejar: EjarInst[]; bankLines: BankLine[]; exceptions: Exception[]; maintenance: Maint[]; meters: MeterReading[]; valuations: Valuation[]; vouchers: Voucher[]; invoices: Invoice[]; budgets: { property_id: string; year: number; revenue: number | null; expenses: number | null; note: string | null }[]; users: { id: string; full_name: string; role: string; active: boolean }[]; tasks: Task[]; taskStates: { key: string; status: string; until: string | null; by_user: string | null }[];
}
export interface AttachMeta { id: string; entity: string; entity_id: string; category: string | null; file_name: string; mime: string; size: number; expires_on: string | null; created_by: string | null; created_at: string }
export interface EjarInst { id: string; contract_no: string; installment_no: string; invoice_no: string | null; issue_date: string | null; due_date: string | null; amount: number; status: string | null;
  contract_type: string | null; ejar_property_id: string | null; state: string | null; start_date: string | null; end_date: string | null; broker: string | null; contract_id: string | null; installment_id: string | null; file_name: string | null }
export interface BankLine { id: string; import_id: string | null; account_id: string | null; date: string; description: string | null; ref: string | null; amount: number; status: 'open' | 'matched' | 'ignored'; payment_id: string | null; note: string | null; matched_by: string | null }
export interface Exception { id: string; rule: string; scope: 'record' | 'before' | 'property'; entity_id: string | null; property_id: string | null; before_date: string | null; reason: string; requested_by: string | null; approved_by: string | null; status: 'pending' | 'approved' | 'rejected'; expires_on: string | null }
export interface Maint { id: string; property_id: string; unit_id: string | null; title: string; details: string | null; priority: string; status: 'open' | 'progress' | 'done' | 'cancelled'; vendor: string | null; est_cost: number | null; cost: number | null; charge_to: string; opened_on: string; closed_on: string | null; expense_id: string | null; created_by: string | null }
export interface Task { id: string; title: string; details: string | null; due: string | null; assignee: string | null; priority: string; status: string; created_by: string | null }

export interface MeterReading { id: string; unit_id: string; kind: 'elec' | 'water'; read_on: string; reading: number; consumption: number | null; rate: number | null; amount: number | null; charged: boolean; installment_id: string | null; note: string | null; created_by: string | null }
export interface Voucher { id: string; voucher_no: string; date: string; kind: string; tenant_id: string | null; contract_id: string | null; payee: string; amount: number; method: string; bank_ref: string | null;
  note: string | null; status: 'pending' | 'approved' | 'voided'; created_by: string | null; approved_by: string | null; approved_at: string | null; void_reason: string | null; created_at: string }
export interface Invoice { id: string; invoice_no: string; kind: 'invoice' | 'credit'; issue_date: string; supply_date: string | null; tenant_id: string | null; contract_id: string | null; installment_id: string | null; payment_id: string | null;
  ref_invoice: string | null; buyer_name: string; buyer_vat: string | null; description: string; net: number; vat_rate: number; vat: number; total: number; seller_name: string; seller_vat: string | null;
  qr: string | null; uuid: string; prev_hash: string | null; hash: string | null; icv: number | null; status: string; zatca_status: string; created_by: string | null; created_at: string }
