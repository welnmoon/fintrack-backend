import { CategoryType } from '@prisma/client';

export type ExpenseIconKey =
  | 'shopping'
  | 'food'
  | 'transport'
  | 'home'
  | 'health'
  | 'education'
  | 'entertainment'
  | 'travel'
  | 'bills'
  | 'subscriptions';

export type IncomeIconKey =
  | 'salary'
  | 'freelance'
  | 'gift'
  | 'interest'
  | 'investment'
  | 'refund'
  | 'bonus'
  | 'rental'
  | 'sale'
  | 'other-income';

export type CategoryIconKey = ExpenseIconKey | IncomeIconKey;

export type CategoryColorKey =
  | 'violet'
  | 'blue'
  | 'sky'
  | 'green'
  | 'emerald'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'pink'
  | 'slate';

export const CATEGORY_COLOR_PRESETS: Record<
  CategoryColorKey,
  { label: string; hex: `#${string}` }
> = {
  violet: { label: 'Фиолетовый', hex: '#7C3AED' },
  blue: { label: 'Синий', hex: '#2563EB' },
  sky: { label: 'Голубой', hex: '#0EA5E9' },
  green: { label: 'Зелёный', hex: '#22C55E' },
  emerald: { label: 'Изумрудный', hex: '#10B981' },
  yellow: { label: 'Жёлтый', hex: '#EAB308' },
  orange: { label: 'Оранжевый', hex: '#F97316' },
  red: { label: 'Красный', hex: '#EF4444' },
  pink: { label: 'Розовый', hex: '#EC4899' },
  slate: { label: 'Серый', hex: '#64748B' },
};

export const EXPENSE_ICON_PRESETS: Record<ExpenseIconKey, { label: string }> = {
  shopping: { label: 'Покупки' },
  food: { label: 'Еда' },
  transport: { label: 'Транспорт' },
  home: { label: 'Дом' },
  health: { label: 'Здоровье' },
  education: { label: 'Образование' },
  entertainment: { label: 'Развлечения' },
  travel: { label: 'Путешествия' },
  bills: { label: 'Коммуналка' },
  subscriptions: { label: 'Подписки' },
};

export const INCOME_ICON_PRESETS: Record<IncomeIconKey, { label: string }> = {
  salary: { label: 'Зарплата' },
  freelance: { label: 'Фриланс' },
  gift: { label: 'Подарки' },
  interest: { label: 'Проценты' },
  investment: { label: 'Инвестиции' },
  refund: { label: 'Возврат' },
  bonus: { label: 'Бонус' },
  rental: { label: 'Аренда' },
  sale: { label: 'Продажа' },
  'other-income': { label: 'Другое' },
};

export const EXPENSE_ICON_KEYS = Object.keys(
  EXPENSE_ICON_PRESETS,
) as ExpenseIconKey[];
export const INCOME_ICON_KEYS = Object.keys(
  INCOME_ICON_PRESETS,
) as IncomeIconKey[];
export const COLOR_KEYS = Object.keys(
  CATEGORY_COLOR_PRESETS,
) as CategoryColorKey[];

export const ICON_KEYS_BY_TYPE: Record<CategoryType, readonly string[]> = {
  EXPENSE: EXPENSE_ICON_KEYS,
  INCOME: INCOME_ICON_KEYS,
};
