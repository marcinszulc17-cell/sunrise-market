import { supabase } from "./supabase";

export type CustomerAccess = {
  ok: boolean;
  registered: boolean;
  verified: boolean;
  reason: string;
  checked_at?: string;
};

const reasonMessage: Record<string, string> = {
  unauthorized: "Zaloguj się przez MySunrise, aby kontynuować.",
  not_registered: "Najpierw załóż konto w MySunrise.",
  missing_email: "Uzupełnij adres e-mail w MySunrise.",
  email_not_confirmed: "Potwierdź adres e-mail w MySunrise.",
  missing_profile: "Dokończ konfigurację profilu w MySunrise.",
  missing_first_name: "Uzupełnij imię w MySunrise.",
  missing_last_name: "Uzupełnij nazwisko w MySunrise.",
  missing_phone: "Uzupełnij numer telefonu w MySunrise.",
  email_required: "Uzupełnij prawidłowy adres e-mail w MySunrise.",
  regulations_not_accepted: "Zaakceptuj regulamin konta w MySunrise.",
};

export function customerAccessMessage(reason?: string) {
  return reasonMessage[String(reason ?? "")] ?? "Dokończ weryfikację konta w MySunrise, aby kupować i rezerwować.";
}

export async function refreshCustomerAccess(): Promise<CustomerAccess> {
  const { data, error } = await supabase.functions.invoke("customer-access", { body: {} });
  if (error) {
    const reason = String((data as any)?.reason ?? "verification_unavailable");
    throw new Error(customerAccessMessage(reason));
  }
  const result = data as CustomerAccess;
  if (!result?.ok || !result.registered || !result.verified) {
    throw new Error(customerAccessMessage(result?.reason));
  }
  return result;
}
