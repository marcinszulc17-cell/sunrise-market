import { supabase } from "./supabase";
import { refreshCustomerAccess } from "./customerAccess";

export type InvoiceDetails = {
  requested: boolean;
  company_name: string;
  tax_id: string;
  street: string;
  city: string;
  postal: string;
  country: string;
};

export const EMPTY_INVOICE: InvoiceDetails = {
  requested: false,
  company_name: "",
  tax_id: "",
  street: "",
  city: "",
  postal: "",
  country: "PL",
};

export function invoiceComplete(invoice: InvoiceDetails) {
  if (!invoice.requested) return true;
  const nip = invoice.tax_id.replace(/\D/g, "");
  return Boolean(
    invoice.company_name.trim()
    && invoice.street.trim()
    && invoice.city.trim()
    && /^\d{2}-\d{3}$/.test(invoice.postal.trim())
    && (invoice.country !== "PL" || /^\d{10}$/.test(nip))
  );
}

export function normalizedInvoice(invoice: InvoiceDetails) {
  return {
    ...invoice,
    company_name: invoice.company_name.trim(),
    tax_id: invoice.country === "PL" ? invoice.tax_id.replace(/\D/g, "") : invoice.tax_id.trim().toUpperCase(),
    street: invoice.street.trim(),
    city: invoice.city.trim(),
    postal: invoice.postal.trim(),
    country: (invoice.country || "PL").trim().toUpperCase(),
  };
}

export async function checkoutWithInvoice(body: Record<string, unknown>, invoice: InvoiceDetails) {
  // MySunrise is the identity hub. Always refresh eligibility immediately before money flow.
  await refreshCustomerAccess();

  const { data, error } = await supabase.functions.invoke("checkout", {
    body: { ...body, invoice: normalizedInvoice(invoice) },
  });
  if (error) {
    const message = (data as any)?.error ?? error.message ?? "Nie udało się rozpocząć płatności";
    throw Object.assign(new Error(message), { context: (error as any).context });
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { order_id: string; url?: string; paid?: number; cashback?: number; balance?: number; error?: string };
}
