require('dotenv/config');

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

function normalizeConnectionString(url) {
  try {
    const parsed = new URL(url);
    const sslmode = parsed.searchParams.get('sslmode')?.toLowerCase();

    if (parsed.searchParams.has('uselibpqcompat')) {
      return parsed.toString();
    }

    if (
      sslmode === 'prefer' ||
      sslmode === 'require' ||
      sslmode === 'verify-ca'
    ) {
      parsed.searchParams.set('sslmode', 'verify-full');
      return parsed.toString();
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl || typeof databaseUrl !== 'string') {
  throw new Error('DATABASE_URL is not defined or is not a string');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: normalizeConnectionString(databaseUrl),
  }),
});

const TARGET_USER_ID =
  process.env.SEED_USER_ID ?? '8be4b8da-98cd-4d33-a313-b0c61d251633';
const TARGET_USER_EMAIL = process.env.SEED_USER_EMAIL ?? 'ne@gmail.com';

function atDaysAgo(daysAgo, hour, minute = 0) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date;
}

async function resolveTargetUser() {
  const userById = await prisma.user.findUnique({
    where: { id: TARGET_USER_ID },
    select: { id: true, email: true },
  });

  if (userById) {
    if (userById.email !== TARGET_USER_EMAIL) {
      throw new Error(
        `User id ${TARGET_USER_ID} belongs to ${userById.email}, expected ${TARGET_USER_EMAIL}`,
      );
    }

    return userById;
  }

  const userByEmail = await prisma.user.findUnique({
    where: { email: TARGET_USER_EMAIL },
    select: { id: true, email: true },
  });

  if (userByEmail) {
    return userByEmail;
  }

  throw new Error(
    `Target user not found. Expected id=${TARGET_USER_ID} or email=${TARGET_USER_EMAIL}`,
  );
}

async function resetUserFinanceData(userId) {
  await prisma.$transaction([
    prisma.transfer.deleteMany({ where: { userId } }),
    prisma.transaction.deleteMany({ where: { userId } }),
    prisma.category.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
  ]);
}

async function createAccountWithNumber(data) {
  const account = await prisma.account.create({ data });
  const accountNumber = `ACC${String(account.sequence).padStart(6, '0')}`;

  return prisma.account.update({
    where: { id: account.id },
    data: { accountNumber },
  });
}

async function main() {
  const user = await resolveTargetUser();

  console.log(`Seeding finance data for ${user.email} (${user.id})`);

  await prisma.user.update({
    where: { id: user.id },
    data: { defaultCurrency: 'KZT' },
  });

  await resetUserFinanceData(user.id);

  const accountDefinitions = [
    {
      name: 'Kaspi Gold',
      type: 'BANK',
      currency: 'KZT',
      backgroundKey: 'aurora-teal',
      initialBalance: 180000,
      createdAt: atDaysAgo(60, 10),
    },
    {
      name: 'Freedom Reserve',
      type: 'BANK',
      currency: 'KZT',
      backgroundKey: 'midnight-indigo',
      initialBalance: 520000,
      createdAt: atDaysAgo(58, 11),
    },
    {
      name: 'Cash Everyday',
      type: 'CASH',
      currency: 'KZT',
      backgroundKey: 'sunset-coral',
      initialBalance: 35000,
      createdAt: atDaysAgo(56, 12),
    },
    {
      name: 'Travel Envelope',
      type: 'BANK',
      currency: 'KZT',
      backgroundKey: 'forest-mint',
      initialBalance: 90000,
      createdAt: atDaysAgo(52, 13),
    },
  ];

  const accounts = [];
  for (const accountDefinition of accountDefinitions) {
    const account = await createAccountWithNumber({
      userId: user.id,
      ...accountDefinition,
    });
    accounts.push(account);
  }

  const accountMap = Object.fromEntries(
    accounts.map((account) => [account.name, account]),
  );

  const categories = [
    {
      name: 'Salary',
      type: 'INCOME',
      iconKey: 'salary',
      colorKey: 'green',
    },
    {
      name: 'Freelance',
      type: 'INCOME',
      iconKey: 'freelance',
      colorKey: 'blue',
    },
    {
      name: 'Bonus',
      type: 'INCOME',
      iconKey: 'bonus',
      colorKey: 'emerald',
    },
    {
      name: 'Refund',
      type: 'INCOME',
      iconKey: 'refund',
      colorKey: 'sky',
    },
    {
      name: 'Investment income',
      type: 'INCOME',
      iconKey: 'investment',
      colorKey: 'yellow',
    },
    {
      name: 'Groceries',
      type: 'EXPENSE',
      iconKey: 'food',
      colorKey: 'orange',
    },
    {
      name: 'Coffee & snacks',
      type: 'EXPENSE',
      iconKey: 'food',
      colorKey: 'yellow',
    },
    {
      name: 'Transport',
      type: 'EXPENSE',
      iconKey: 'transport',
      colorKey: 'sky',
    },
    {
      name: 'Dining out',
      type: 'EXPENSE',
      iconKey: 'entertainment',
      colorKey: 'pink',
    },
    {
      name: 'Shopping',
      type: 'EXPENSE',
      iconKey: 'shopping',
      colorKey: 'violet',
    },
    {
      name: 'Entertainment',
      type: 'EXPENSE',
      iconKey: 'entertainment',
      colorKey: 'red',
    },
    {
      name: 'Bills',
      type: 'EXPENSE',
      iconKey: 'bills',
      colorKey: 'blue',
    },
    {
      name: 'Subscriptions',
      type: 'EXPENSE',
      iconKey: 'subscriptions',
      colorKey: 'slate',
    },
    {
      name: 'Health',
      type: 'EXPENSE',
      iconKey: 'health',
      colorKey: 'green',
    },
    {
      name: 'Travel',
      type: 'EXPENSE',
      iconKey: 'travel',
      colorKey: 'emerald',
    },
    {
      name: 'Home',
      type: 'EXPENSE',
      iconKey: 'home',
      colorKey: 'orange',
    },
  ];

  await prisma.category.createMany({
    data: categories.map((category) => ({
      ...category,
      userId: user.id,
    })),
  });

  const createdCategories = await prisma.category.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, type: true },
  });

  const categoryMap = Object.fromEntries(
    createdCategories.map((category) => [
      `${category.type}:${category.name}`,
      category.id,
    ]),
  );

  const transactions = [
    {
      type: 'INCOME',
      account: 'Kaspi Gold',
      category: 'Salary',
      amount: 420000,
      occurredAt: atDaysAgo(32, 9, 30),
      emotion: 'HAPPY',
      note: 'Зарплата за прошлый месяц',
    },
    {
      type: 'INCOME',
      account: 'Kaspi Gold',
      category: 'Freelance',
      amount: 85000,
      occurredAt: atDaysAgo(27, 20, 0),
      emotion: 'HAPPY',
      note: 'Оплата за лендинг',
    },
    {
      type: 'INCOME',
      account: 'Freedom Reserve',
      category: 'Investment income',
      amount: 38000,
      occurredAt: atDaysAgo(19, 12, 15),
      emotion: 'NEUTRAL',
      note: 'Доход по инвестициям',
    },
    {
      type: 'INCOME',
      account: 'Freedom Reserve',
      category: 'Bonus',
      amount: 45000,
      occurredAt: atDaysAgo(17, 14, 0),
      emotion: 'HAPPY',
      note: 'Квартальный бонус',
    },
    {
      type: 'INCOME',
      account: 'Kaspi Gold',
      category: 'Salary',
      amount: 430000,
      occurredAt: atDaysAgo(4, 9, 10),
      emotion: 'HAPPY',
      note: 'Зарплата за текущий месяц',
    },
    {
      type: 'INCOME',
      account: 'Kaspi Gold',
      category: 'Freelance',
      amount: 95000,
      occurredAt: atDaysAgo(2, 21, 10),
      emotion: 'HAPPY',
      note: 'Оплата за UI audit',
    },
    {
      type: 'INCOME',
      account: 'Kaspi Gold',
      category: 'Refund',
      amount: 8000,
      occurredAt: atDaysAgo(1, 16, 40),
      emotion: 'NEUTRAL',
      note: 'Возврат за отмененный заказ',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Groceries',
      amount: 15200,
      occurredAt: atDaysAgo(30, 18, 20),
      emotion: 'NEUTRAL',
      note: 'Недельная закупка продуктов',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Dining out',
      amount: 8600,
      occurredAt: atDaysAgo(29, 20, 45),
      emotion: 'HAPPY',
      note: 'Ужин с друзьями',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Shopping',
      amount: 41000,
      occurredAt: atDaysAgo(27, 22, 0),
      emotion: 'IMPULSIVE',
      note: 'Спонтанный заказ одежды на маркетплейсе',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Bills',
      amount: 23600,
      occurredAt: atDaysAgo(24, 10, 10),
      emotion: 'STRESS',
      note: 'Коммунальные услуги',
    },
    {
      type: 'EXPENSE',
      account: 'Travel Envelope',
      category: 'Entertainment',
      amount: 14000,
      occurredAt: atDaysAgo(22, 21, 15),
      emotion: 'HAPPY',
      note: 'Кино и ужин',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Home',
      amount: 32000,
      occurredAt: atDaysAgo(20, 13, 30),
      emotion: 'NEUTRAL',
      note: 'Товары для дома',
    },
    {
      type: 'EXPENSE',
      account: 'Cash Everyday',
      category: 'Transport',
      amount: 2800,
      occurredAt: atDaysAgo(18, 8, 50),
      emotion: 'NEUTRAL',
      note: 'Такси до офиса',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Groceries',
      amount: 16700,
      occurredAt: atDaysAgo(16, 19, 0),
      emotion: 'NEUTRAL',
      note: 'Продукты на неделю',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Health',
      amount: 12000,
      occurredAt: atDaysAgo(15, 17, 20),
      emotion: 'STRESS',
      note: 'Аптека и анализы',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Shopping',
      amount: 28500,
      occurredAt: atDaysAgo(12, 22, 5),
      emotion: 'REGRET',
      note: 'Купил аксессуары, которые не нужны',
    },
    {
      type: 'EXPENSE',
      account: 'Travel Envelope',
      category: 'Travel',
      amount: 46000,
      occurredAt: atDaysAgo(10, 15, 45),
      emotion: 'HAPPY',
      note: 'Бронь выходных за городом',
    },
    {
      type: 'EXPENSE',
      account: 'Travel Envelope',
      category: 'Entertainment',
      amount: 9900,
      occurredAt: atDaysAgo(9, 20, 30),
      emotion: 'IMPULSIVE',
      note: 'Билеты на концерт в последний момент',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Bills',
      amount: 17700,
      occurredAt: atDaysAgo(8, 11, 0),
      emotion: 'STRESS',
      note: 'Интернет и мобильная связь',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Subscriptions',
      amount: 2590,
      occurredAt: atDaysAgo(7, 9, 5),
      emotion: 'NEUTRAL',
      note: 'Музыкальный сервис',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Dining out',
      amount: 10300,
      occurredAt: atDaysAgo(6, 20, 50),
      emotion: 'HAPPY',
      note: 'Ужин после тяжелой недели',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Groceries',
      amount: 14900,
      occurredAt: atDaysAgo(5, 18, 15),
      emotion: 'NEUTRAL',
      note: 'Продукты и бытовые мелочи',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Groceries',
      amount: 17800,
      occurredAt: atDaysAgo(4, 11, 30),
      emotion: 'NEUTRAL',
      note: 'Закупка на несколько дней',
    },
    {
      type: 'EXPENSE',
      account: 'Cash Everyday',
      category: 'Transport',
      amount: 3200,
      occurredAt: atDaysAgo(4, 8, 40),
      emotion: 'STRESS',
      note: 'Такси из-за опоздания',
    },
    {
      type: 'EXPENSE',
      account: 'Cash Everyday',
      category: 'Coffee & snacks',
      amount: 1900,
      occurredAt: atDaysAgo(4, 15, 20),
      emotion: 'HAPPY',
      note: 'Кофе и перекус',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Shopping',
      amount: 26500,
      occurredAt: atDaysAgo(4, 22, 15),
      emotion: 'IMPULSIVE',
      note: 'Поздний спонтанный заказ одежды',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Subscriptions',
      amount: 3490,
      occurredAt: atDaysAgo(4, 9, 0),
      emotion: 'NEUTRAL',
      note: 'Дизайн-подписка',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Dining out',
      amount: 9200,
      occurredAt: atDaysAgo(3, 20, 10),
      emotion: 'HAPPY',
      note: 'Обед вне дома',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Groceries',
      amount: 14600,
      occurredAt: atDaysAgo(3, 18, 30),
      emotion: 'NEUTRAL',
      note: 'Продукты и фрукты',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Bills',
      amount: 18400,
      occurredAt: atDaysAgo(3, 10, 45),
      emotion: 'STRESS',
      note: 'Оплата коммуналки и домофона',
    },
    {
      type: 'EXPENSE',
      account: 'Travel Envelope',
      category: 'Entertainment',
      amount: 7800,
      occurredAt: atDaysAgo(3, 22, 40),
      emotion: 'HAPPY',
      note: 'Кино с друзьями',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Shopping',
      amount: 31800,
      occurredAt: atDaysAgo(2, 23, 0),
      emotion: 'REGRET',
      note: 'Импульсивная покупка гаджета',
    },
    {
      type: 'EXPENSE',
      account: 'Cash Everyday',
      category: 'Transport',
      amount: 2800,
      occurredAt: atDaysAgo(2, 8, 35),
      emotion: 'STRESS',
      note: 'Такси утром',
    },
    {
      type: 'EXPENSE',
      account: 'Cash Everyday',
      category: 'Coffee & snacks',
      amount: 2100,
      occurredAt: atDaysAgo(2, 16, 10),
      emotion: 'NEUTRAL',
      note: 'Кофе после встречи',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Groceries',
      amount: 12400,
      occurredAt: atDaysAgo(2, 19, 10),
      emotion: 'NEUTRAL',
      note: 'Быстрый заезд в магазин',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Health',
      amount: 9500,
      occurredAt: atDaysAgo(2, 13, 5),
      emotion: 'STRESS',
      note: 'Аптека',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Dining out',
      amount: 11400,
      occurredAt: atDaysAgo(1, 20, 20),
      emotion: 'HAPPY',
      note: 'Ужин с коллегами',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Shopping',
      amount: 22900,
      occurredAt: atDaysAgo(1, 22, 25),
      emotion: 'IMPULSIVE',
      note: 'Заказал кроссовки без плана',
    },
    {
      type: 'EXPENSE',
      account: 'Travel Envelope',
      category: 'Entertainment',
      amount: 6500,
      occurredAt: atDaysAgo(1, 21, 40),
      emotion: 'IMPULSIVE',
      note: 'Вечерний киносеанс',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Groceries',
      amount: 15800,
      occurredAt: atDaysAgo(1, 18, 0),
      emotion: 'NEUTRAL',
      note: 'Закупка продуктов',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Bills',
      amount: 9700,
      occurredAt: atDaysAgo(1, 10, 20),
      emotion: 'STRESS',
      note: 'Оплата сервиса и связи',
    },
    {
      type: 'EXPENSE',
      account: 'Cash Everyday',
      category: 'Coffee & snacks',
      amount: 1700,
      occurredAt: atDaysAgo(0, 10, 5),
      emotion: 'HAPPY',
      note: 'Утренний кофе',
    },
    {
      type: 'EXPENSE',
      account: 'Cash Everyday',
      category: 'Transport',
      amount: 2400,
      occurredAt: atDaysAgo(0, 8, 15),
      emotion: 'NEUTRAL',
      note: 'Поездка по делам',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Shopping',
      amount: 18900,
      occurredAt: atDaysAgo(0, 14, 40),
      emotion: 'REGRET',
      note: 'Еще одна спонтанная покупка на маркетплейсе',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Groceries',
      amount: 13200,
      occurredAt: atDaysAgo(0, 18, 20),
      emotion: 'NEUTRAL',
      note: 'Продукты к ужину',
    },
    {
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Subscriptions',
      amount: 2590,
      occurredAt: atDaysAgo(0, 9, 0),
      emotion: 'NEUTRAL',
      note: 'Подписка на стриминг',
    },
    {
      type: 'EXPENSE',
      account: 'Travel Envelope',
      category: 'Travel',
      amount: 22000,
      occurredAt: atDaysAgo(0, 19, 10),
      emotion: 'IMPULSIVE',
      note: 'Быстрая бронь на выходные',
    },
  ];

  await prisma.transaction.createMany({
    data: transactions.map((transaction) => ({
      userId: user.id,
      accountId: accountMap[transaction.account].id,
      categoryId: categoryMap[`${transaction.type}:${transaction.category}`],
      type: transaction.type,
      emotion: transaction.emotion,
      amount: transaction.amount,
      occurredAt: transaction.occurredAt,
      note: transaction.note,
    })),
  });

  const transfers = [
    {
      fromAccount: 'Kaspi Gold',
      toAccount: 'Freedom Reserve',
      fromAmount: 150000,
      toAmount: 150000,
      exchangeRate: 1,
      occurredAt: atDaysAgo(28, 19, 0),
      note: 'Перевел часть зарплаты в резерв',
    },
    {
      fromAccount: 'Kaspi Gold',
      toAccount: 'Cash Everyday',
      fromAmount: 20000,
      toAmount: 20000,
      exchangeRate: 1,
      occurredAt: atDaysAgo(14, 8, 0),
      note: 'Снятие наличных на неделю',
    },
    {
      fromAccount: 'Kaspi Gold',
      toAccount: 'Travel Envelope',
      fromAmount: 60000,
      toAmount: 60000,
      exchangeRate: 1,
      occurredAt: atDaysAgo(6, 12, 30),
      note: 'Пополнение конверта на поездки',
    },
    {
      fromAccount: 'Cash Everyday',
      toAccount: 'Kaspi Gold',
      fromAmount: 8000,
      toAmount: 8000,
      exchangeRate: 1,
      occurredAt: atDaysAgo(2, 18, 45),
      note: 'Вернул остаток наличных обратно на карту',
    },
  ];

  await prisma.transfer.createMany({
    data: transfers.map((transfer) => ({
      userId: user.id,
      fromAccountId: accountMap[transfer.fromAccount].id,
      toAccountId: accountMap[transfer.toAccount].id,
      fromAmount: transfer.fromAmount,
      toAmount: transfer.toAmount,
      exchangeRate: transfer.exchangeRate,
      occurredAt: transfer.occurredAt,
      note: transfer.note,
    })),
  });

  const [accountsCount, categoriesCount, transactionsCount, transfersCount] =
    await Promise.all([
      prisma.account.count({ where: { userId: user.id } }),
      prisma.category.count({ where: { userId: user.id } }),
      prisma.transaction.count({ where: { userId: user.id } }),
      prisma.transfer.count({ where: { userId: user.id } }),
    ]);

  console.log(
    [
      `Seed complete for ${user.email}`,
      `accounts=${accountsCount}`,
      `categories=${categoriesCount}`,
      `transactions=${transactionsCount}`,
      `transfers=${transfersCount}`,
    ].join(' | '),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
