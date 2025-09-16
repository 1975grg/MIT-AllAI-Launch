import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Property, Transaction } from "@shared/schema";

interface ScheduleEReportProps {
  properties: Property[];
  transactions: Transaction[];
  year: number;
}

interface PropertyData {
  property: Property;
  income: number;
  expenses: Record<string, number>;
  totalExpenses: number;
  netIncome: number;
}

const SCHEDULE_E_CATEGORIES = {
  advertising: { line: "5", label: "Advertising" },
  auto_travel: { line: "6", label: "Auto and travel" },
  cleaning_maintenance: { line: "7", label: "Cleaning and maintenance" },
  commissions: { line: "8", label: "Commissions" },
  insurance: { line: "9", label: "Insurance" },
  legal_professional: { line: "10", label: "Legal and other professional fees" },
  management_fees: { line: "11", label: "Management fees" },
  mortgage_interest: { line: "12", label: "Mortgage interest paid to banks, etc." },
  other_interest: { line: "13", label: "Other interest" },
  repairs: { line: "14", label: "Repairs" },
  supplies: { line: "15", label: "Supplies" },
  taxes: { line: "16", label: "Taxes" },
  utilities: { line: "17", label: "Utilities" },
  depreciation: { line: "18", label: "Depreciation expense or depletion" },
  other_expenses: { line: "19", label: "Other (list)" }
};

export default function ScheduleEReport({ properties, transactions, year }: ScheduleEReportProps) {
  // Filter transactions for the specified year
  const yearTransactions = transactions.filter(t => 
    new Date(t.date).getFullYear() === year
  );

  // Calculate data for each property
  const propertiesData: PropertyData[] = properties.map(property => {
    const propertyTransactions = yearTransactions.filter(t => 
      t.propertyId === property.id
    );

    // Calculate rental income (paid rent + partial payments)
    const income = propertyTransactions
      .filter(t => t.type === "Income" && (t.paymentStatus === "Paid" || t.paymentStatus === "Partial"))
      .reduce((sum, t) => {
        if (t.paymentStatus === "Paid") {
          return sum + parseFloat(t.amount);
        } else if (t.paymentStatus === "Partial" && t.paidAmount) {
          return sum + parseFloat(t.paidAmount);
        }
        return sum;
      }, 0);

    // Calculate expenses by Schedule E category
    const expenses: Record<string, number> = {};
    Object.keys(SCHEDULE_E_CATEGORIES).forEach(category => {
      expenses[category] = propertyTransactions
        .filter(t => 
          t.type === "Expense" && 
          t.taxDeductible && 
          t.scheduleECategory === category
        )
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
    });

    const totalExpenses = Object.values(expenses).reduce((sum, amount) => sum + amount, 0);
    const netIncome = income - totalExpenses;

    return {
      property,
      income,
      expenses,
      totalExpenses,
      netIncome
    };
  });

  // Calculate totals across all properties
  const totals = {
    income: propertiesData.reduce((sum, p) => sum + p.income, 0),
    expenses: {} as Record<string, number>,
    totalExpenses: propertiesData.reduce((sum, p) => sum + p.totalExpenses, 0),
    netIncome: propertiesData.reduce((sum, p) => sum + p.netIncome, 0)
  };

  // Calculate total expenses by category
  Object.keys(SCHEDULE_E_CATEGORIES).forEach(category => {
    totals.expenses[category] = propertiesData.reduce((sum, p) => sum + p.expenses[category], 0);
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const hasAnyData = totals.income > 0 || totals.totalExpenses > 0;

  if (!hasAnyData) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <p className="text-muted-foreground">
            No rental income or deductible expenses found for {year}.
            <br />
            Add rental income and categorized expenses to see your Schedule E preview.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            Schedule E Preview - {year}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Preliminary Schedule E based on your categorized income and expenses
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Property Summary Table */}
            {properties.length > 1 && (
              <div>
                <h3 className="font-semibold mb-3">Property Summary</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse border border-gray-200">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-200 px-3 py-2 text-left">Property</th>
                        <th className="border border-gray-200 px-3 py-2 text-right">Income</th>
                        <th className="border border-gray-200 px-3 py-2 text-right">Expenses</th>
                        <th className="border border-gray-200 px-3 py-2 text-right">Net Income</th>
                      </tr>
                    </thead>
                    <tbody>
                      {propertiesData.map((data, index) => (
                        <tr key={data.property.id}>
                          <td className="border border-gray-200 px-3 py-2">
                            {data.property.name || `${data.property.street}, ${data.property.city}`}
                          </td>
                          <td className="border border-gray-200 px-3 py-2 text-right">
                            {formatCurrency(data.income)}
                          </td>
                          <td className="border border-gray-200 px-3 py-2 text-right">
                            {formatCurrency(data.totalExpenses)}
                          </td>
                          <td className={`border border-gray-200 px-3 py-2 text-right ${
                            data.netIncome >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {formatCurrency(data.netIncome)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Schedule E Format */}
            <div>
              <h3 className="font-semibold mb-3">Schedule E - Supplemental Income and Loss</h3>
              <div className="space-y-1 text-sm">
                {/* Income Section */}
                <div className="grid grid-cols-3 gap-4 py-2 border-b border-gray-200">
                  <div className="font-medium">3. Rents received</div>
                  <div></div>
                  <div className="text-right font-medium">{formatCurrency(totals.income)}</div>
                </div>

                {/* Expenses Section */}
                <div className="font-medium py-2">Expenses:</div>
                
                {Object.entries(SCHEDULE_E_CATEGORIES).map(([category, info]) => {
                  const amount = totals.expenses[category];
                  if (amount === 0) return null;
                  
                  return (
                    <div key={category} className="grid grid-cols-3 gap-4 py-1">
                      <div>{info.line}. {info.label}</div>
                      <div></div>
                      <div className="text-right">{formatCurrency(amount)}</div>
                    </div>
                  );
                })}

                {/* Total Expenses */}
                <div className="grid grid-cols-3 gap-4 py-2 border-t border-gray-200 font-medium">
                  <div>20. Total expenses</div>
                  <div></div>
                  <div className="text-right">{formatCurrency(totals.totalExpenses)}</div>
                </div>

                {/* Net Rental Income */}
                <div className={`grid grid-cols-3 gap-4 py-2 border-t-2 border-gray-300 font-bold text-lg ${
                  totals.netIncome >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  <div>26. Total rental real estate income or (loss)</div>
                  <div></div>
                  <div className="text-right">{formatCurrency(totals.netIncome)}</div>
                </div>
              </div>
            </div>

            {/* Additional Information */}
            <div className="bg-blue-50 dark:bg-blue-950/50 p-4 rounded-lg">
              <h4 className="font-semibold text-sm mb-2">Important Notes:</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• This is a preliminary report based on your current categorized expenses</li>
                <li>• Review all amounts for accuracy before filing your tax return</li>
                <li>• Ensure all rental income and deductible expenses are properly recorded</li>
                <li>• Consider depreciation deductions for your rental properties</li>
                <li>• Consult with a tax professional for complex situations</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}