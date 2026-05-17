export interface WeightedAverageInput {
  currentQuantity: string | number;
  currentAvgCost: string | number;
  quantity: string | number;
  unitCost: string | number;
}

function numberValue(value: string | number) {
  return typeof value === "number" ? value : Number(value);
}

export function applyWeightedAverageReceipt(input: WeightedAverageInput) {
  const currentQuantity = numberValue(input.currentQuantity);
  const currentAvgCost = numberValue(input.currentAvgCost);
  const quantity = numberValue(input.quantity);
  const unitCost = numberValue(input.unitCost);
  const newQuantity = currentQuantity + quantity;
  const oldValue = currentQuantity * currentAvgCost;
  const receiptValue = quantity * unitCost;
  const newAvgCost = newQuantity === 0 ? 0 : (oldValue + receiptValue) / newQuantity;
  const newValue = newQuantity * newAvgCost;

  return {
    runningQuantityAfter: newQuantity.toFixed(4),
    runningAvgCostAfter: newAvgCost.toFixed(4),
    runningValueAfter: newValue.toFixed(2),
    totalCost: Math.abs(receiptValue).toFixed(2),
  };
}

export function applyWeightedAverageIssue(input: WeightedAverageInput) {
  const currentQuantity = numberValue(input.currentQuantity);
  const currentAvgCost = numberValue(input.currentAvgCost);
  const quantity = numberValue(input.quantity);
  const unitCost = numberValue(input.unitCost);
  const newQuantity = currentQuantity + quantity;
  const newValue = newQuantity * currentAvgCost;

  return {
    runningQuantityAfter: newQuantity.toFixed(4),
    runningAvgCostAfter: currentAvgCost.toFixed(4),
    runningValueAfter: newValue.toFixed(2),
    totalCost: Math.abs(quantity * unitCost).toFixed(2),
  };
}
