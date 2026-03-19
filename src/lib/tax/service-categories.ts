// WHT service categories for payments to individuals (PND 3)
// Rate = standard WHT rate for the service type
// Code = RD payment type code for the WHT certificate
// Section = Income Tax Act section

export interface ServiceCategory {
  value: string;
  label: string;
  rate: string; // NUMERIC(5,4) format
  code: string; // rdPaymentTypeCode
  section: string;
}

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  {
    value: "general_service",
    label: "General Services (บริการทั่วไป)",
    rate: "0.0300",
    code: "6",
    section: "40(8)",
  },
  {
    value: "professional_fee",
    label: "Professional Fees (ค่าวิชาชีพ)",
    rate: "0.0300",
    code: "6",
    section: "40(6)",
  },
  {
    value: "advertising",
    label: "Advertising (ค่าโฆษณา)",
    rate: "0.0200",
    code: "6",
    section: "40(8)",
  },
  {
    value: "entertainment",
    label: "Entertainment (ค่าแสดง)",
    rate: "0.0500",
    code: "6",
    section: "40(8)",
  },
  {
    value: "transport",
    label: "Transport (ค่าขนส่ง)",
    rate: "0.0100",
    code: "6",
    section: "40(8)",
  },
  {
    value: "rental",
    label: "Rental (ค่าเช่า)",
    rate: "0.0500",
    code: "5",
    section: "40(5)",
  },
  {
    value: "contract_work",
    label: "Contract Work (ค่ารับเหมา)",
    rate: "0.0300",
    code: "7",
    section: "40(7)",
  },
] as const;

export function getServiceCategory(value: string): ServiceCategory | undefined {
  return SERVICE_CATEGORIES.find((c) => c.value === value);
}
