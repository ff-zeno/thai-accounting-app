UPDATE "tax_min_life_by_category"
SET
  "tax_useful_life_months_minimum" = CASE "category"
    WHEN 'temporary_building' THEN 12
    WHEN 'computer_hardware' THEN 36
    WHEN 'computer_software' THEN 36
    WHEN 'leasehold_improvement' THEN 120
    WHEN 'natural_resource_right' THEN 240
    ELSE "tax_useful_life_months_minimum"
  END,
  "source_citation" = CASE
    WHEN "category" IN (
      'temporary_building',
      'computer_hardware',
      'computer_software',
      'leasehold_improvement',
      'natural_resource_right'
    )
    THEN 'Revenue Department corporate income tax depreciation table, https://www.rd.go.th/english/6044.html, retrieved 2026-05-16'
    ELSE "source_citation"
  END,
  "updated_at" = now()
WHERE "category" IN (
  'temporary_building',
  'computer_hardware',
  'computer_software',
  'leasehold_improvement',
  'natural_resource_right'
);
