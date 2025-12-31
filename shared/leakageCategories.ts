export type LeakageCategory = 
  | "Wallet Friction"
  | "Expired Access" 
  | "Security / Hard Decline"
  | "Bank Bottleneck"
  | "Unknown";

export interface CategoryData {
  category: LeakageCategory;
  value: number;
  count: number;
  percentage: number;
  color: string;
}

const CATEGORY_COLORS: Record<LeakageCategory, string> = {
  "Wallet Friction": "#f59e0b",
  "Expired Access": "#8b5cf6",
  "Security / Hard Decline": "#ef4444",
  "Bank Bottleneck": "#3b82f6",
  "Unknown": "#6b7280",
};

const CATEGORY_RECOVERABILITY: Record<LeakageCategory, number> = {
  "Wallet Friction": 85,
  "Expired Access": 70,
  "Security / Hard Decline": 15,
  "Bank Bottleneck": 60,
  "Unknown": 50,
};

export function mapFailureCodeToCategory(failureCode: string | null | undefined): LeakageCategory {
  if (!failureCode) return "Unknown";
  
  const code = failureCode.toLowerCase();
  
  if (code === "insufficient_funds") {
    return "Wallet Friction";
  }
  
  if (code === "expired_card") {
    return "Expired Access";
  }
  
  if (["stolen_card", "fraudulent", "incorrect_cvc", "card_declined"].includes(code)) {
    return "Security / Hard Decline";
  }
  
  if (["generic_decline", "transaction_not_allowed", "processing_error", "do_not_honor"].includes(code)) {
    return "Bank Bottleneck";
  }
  
  return "Unknown";
}

export function getCategoryColor(category: LeakageCategory): string {
  return CATEGORY_COLORS[category];
}

export function getCategoryRecoverability(category: LeakageCategory): number {
  return CATEGORY_RECOVERABILITY[category];
}

export function aggregateByCategory(
  ghosts: Array<{ failureCode?: string | null; amount: number }>
): CategoryData[] {
  const categoryTotals: Record<LeakageCategory, { value: number; count: number }> = {
    "Wallet Friction": { value: 0, count: 0 },
    "Expired Access": { value: 0, count: 0 },
    "Security / Hard Decline": { value: 0, count: 0 },
    "Bank Bottleneck": { value: 0, count: 0 },
    "Unknown": { value: 0, count: 0 },
  };

  for (const ghost of ghosts) {
    const category = mapFailureCodeToCategory(ghost.failureCode);
    categoryTotals[category].value += ghost.amount;
    categoryTotals[category].count += 1;
  }

  const totalValue = Object.values(categoryTotals).reduce((sum, cat) => sum + cat.value, 0);

  const result: CategoryData[] = [];
  for (const [category, data] of Object.entries(categoryTotals)) {
    if (data.count > 0) {
      result.push({
        category: category as LeakageCategory,
        value: data.value,
        count: data.count,
        percentage: totalValue > 0 ? Math.round((data.value / totalValue) * 100) : 0,
        color: getCategoryColor(category as LeakageCategory),
      });
    }
  }

  return result.sort((a, b) => b.value - a.value);
}
