import type { Transaction } from "@shared/schema";

/**
 * Calculate the tax deductible amount for a given expense in a specific year
 * @param expense - The expense transaction
 * @param year - The tax year to calculate for
 * @returns The deductible amount for that year
 */
export function getExpenseDeductionForYear(expense: Transaction, year: number): number {
  // Non-deductible expenses have no deduction
  if (!expense.taxDeductible) {
    return 0;
  }

  // Non-amortized expenses are fully deductible in the expense year
  if (!expense.isAmortized || !expense.amortizationYears || !expense.amortizationStartDate) {
    const expenseYear = new Date(expense.date).getUTCFullYear();
    return expenseYear === year ? Number(expense.amount) : 0;
  }

  // Calculate amortized deduction using simple year-based arithmetic
  // For expenses: if entered in Sept 2025 for 2 years, half goes to 2025 and half to 2026
  const totalAmount = Number(expense.amount);
  const startYear = new Date(expense.amortizationStartDate).getUTCFullYear();
  const endYear = startYear + expense.amortizationYears - 1;
  
  // Check if target year is within amortization period
  if (year < startYear || year > endYear) {
    return 0;
  }
  
  // Simple equal distribution across years
  const yearlyAmount = totalAmount / expense.amortizationYears;
  return yearlyAmount;
}

/**
 * Get comprehensive amortization status for an expense
 * @param expense - The expense transaction
 * @param currentYear - The current tax year
 * @returns Amortization status object with progress details
 */
export function getAmortizationStatus(expense: Transaction, currentYear: number = new Date().getUTCFullYear()) {
  const totalAmount = Number(expense.amount);
  const currentYearDeduction = getExpenseDeductionForYear(expense, currentYear);

  // Non-deductible expenses - nothing to track
  if (!expense.taxDeductible) {
    return {
      isAmortized: false,
      isDeductible: false,
      totalAmount,
      amortizationYears: 0,
      startYear: new Date(expense.date).getUTCFullYear(),
      endYear: new Date(expense.date).getUTCFullYear(),
      currentYearDeduction: 0,
      totalDeductedSoFar: 0,
      remainingToDeduct: 0,
      yearsRemaining: 0,
      isCompleted: false,
      annualAmount: 0
    };
  }

  // Non-amortized but deductible expenses
  if (!expense.isAmortized || !expense.amortizationYears || !expense.amortizationStartDate) {
    const expenseYear = new Date(expense.date).getUTCFullYear();
    const isFullyDeducted = currentYear >= expenseYear;

    return {
      isAmortized: false,
      isDeductible: true,
      totalAmount,
      amortizationYears: 0,
      startYear: expenseYear,
      endYear: expenseYear,
      currentYearDeduction,
      totalDeductedSoFar: isFullyDeducted ? totalAmount : 0,
      remainingToDeduct: isFullyDeducted ? 0 : totalAmount,
      yearsRemaining: isFullyDeducted ? 0 : Math.max(0, expenseYear - currentYear),
      isCompleted: isFullyDeducted,
      annualAmount: totalAmount
    };
  }

  // Amortized expenses using simple year-based arithmetic
  const startYear = new Date(expense.amortizationStartDate).getUTCFullYear();
  const endYear = startYear + expense.amortizationYears - 1;
  const annualAmount = totalAmount / expense.amortizationYears;

  // Calculate total deducted so far (all years from start through current year)
  let totalDeductedSoFar = 0;
  for (let year = startYear; year <= Math.min(currentYear, endYear); year++) {
    totalDeductedSoFar += getExpenseDeductionForYear(expense, year);
  }

  const remainingToDeduct = Math.max(0, totalAmount - totalDeductedSoFar);
  const yearsRemaining = Math.max(0, endYear - currentYear);
  const isCompleted = currentYear > endYear;

  return {
    isAmortized: true,
    isDeductible: true,
    totalAmount,
    amortizationYears: expense.amortizationYears,
    startYear,
    endYear: endYear,
    currentYearDeduction,
    totalDeductedSoFar,
    remainingToDeduct,
    yearsRemaining,
    isCompleted,
    annualAmount
  };
}

/**
 * Format amortization status for display
 * @param status - The amortization status object
 * @returns Formatted strings for UI display
 */
export function formatAmortizationDisplay(status: ReturnType<typeof getAmortizationStatus>) {
  const { 
    isAmortized, 
    isDeductible,
    totalAmount, 
    currentYearDeduction, 
    totalDeductedSoFar, 
    remainingToDeduct, 
    yearsRemaining, 
    isCompleted,
    startYear,
    endYear
  } = status;

  // Non-deductible expenses
  if (!isDeductible) {
    return {
      badge: "Not Deductible",
      description: `$${totalAmount.toLocaleString()} - not tax deductible`,
      progress: "Not deductible for tax purposes",
      currentYear: "Not deductible this year"
    };
  }

  // Deductible but not amortized expenses
  if (!isAmortized) {
    return {
      badge: "Full Deduction",
      description: `$${totalAmount.toLocaleString()} deductible in ${startYear}`,
      progress: isCompleted ? "✓ Fully Deducted" : `Deductible in ${startYear}`,
      currentYear: currentYearDeduction > 0 ? `$${currentYearDeduction.toLocaleString()} this year` : "Not deductible this year"
    };
  }

  // Amortized expenses - use consistent exclusive years remaining
  const badgeText = isCompleted ? "Amortization Complete" : `${yearsRemaining} Years Remaining`;
  const progressText = isCompleted 
    ? "✓ Fully Amortized" 
    : `$${remainingToDeduct.toLocaleString()} remaining over ${yearsRemaining} years`;

  return {
    badge: badgeText,
    description: `$${totalAmount.toLocaleString()} over ${status.amortizationYears} years (${startYear}-${endYear})`,
    progress: progressText,
    currentYear: currentYearDeduction > 0 ? `$${currentYearDeduction.toLocaleString()} this year` : "Not deductible this year",
    summary: `$${totalDeductedSoFar.toLocaleString()} deducted so far`
  };
}