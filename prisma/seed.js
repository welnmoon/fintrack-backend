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

  // ── Accounts ────────────────────────────────────────────────────────────────

  const accountDefinitions = [
    {
      name: 'Kaspi Gold',
      type: 'BANK',
      currency: 'KZT',
      backgroundKey: 'aurora-teal',
      initialBalance: 180000,
      createdAt: atDaysAgo(185, 10),
    },
    {
      name: 'Freedom Reserve',
      type: 'BANK',
      currency: 'KZT',
      backgroundKey: 'midnight-indigo',
      initialBalance: 320000,
      createdAt: atDaysAgo(183, 11),
    },
    {
      name: 'Cash Everyday',
      type: 'CASH',
      currency: 'KZT',
      backgroundKey: 'sunset-coral',
      initialBalance: 25000,
      createdAt: atDaysAgo(182, 12),
    },
    {
      name: 'Travel Envelope',
      type: 'BANK',
      currency: 'KZT',
      backgroundKey: 'forest-mint',
      initialBalance: 70000,
      createdAt: atDaysAgo(180, 13),
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

  // ── Categories ───────────────────────────────────────────────────────────────

  const categories = [
    // Income
    { name: 'Зарплата',       type: 'INCOME',  iconKey: 'salary',        colorKey: 'green'   },
    { name: 'Фриланс',        type: 'INCOME',  iconKey: 'freelance',     colorKey: 'blue'    },
    { name: 'Бонус',          type: 'INCOME',  iconKey: 'bonus',         colorKey: 'emerald' },
    { name: 'Возврат',        type: 'INCOME',  iconKey: 'refund',        colorKey: 'sky'     },
    { name: 'Инвест. доход',  type: 'INCOME',  iconKey: 'investment',    colorKey: 'yellow'  },
    // Expense
    { name: 'Аренда',         type: 'EXPENSE', iconKey: 'home',          colorKey: 'red'     },
    { name: 'Продукты',       type: 'EXPENSE', iconKey: 'food',          colorKey: 'orange'  },
    { name: 'Кофе и снеки',   type: 'EXPENSE', iconKey: 'food',          colorKey: 'yellow'  },
    { name: 'Транспорт',      type: 'EXPENSE', iconKey: 'transport',     colorKey: 'sky'     },
    { name: 'Кафе и рестораны', type: 'EXPENSE', iconKey: 'entertainment', colorKey: 'pink'  },
    { name: 'Покупки',        type: 'EXPENSE', iconKey: 'shopping',      colorKey: 'violet'  },
    { name: 'Развлечения',    type: 'EXPENSE', iconKey: 'entertainment', colorKey: 'red'     },
    { name: 'Счета',          type: 'EXPENSE', iconKey: 'bills',         colorKey: 'blue'    },
    { name: 'Подписки',       type: 'EXPENSE', iconKey: 'subscriptions', colorKey: 'slate'   },
    { name: 'Здоровье',       type: 'EXPENSE', iconKey: 'health',        colorKey: 'green'   },
    { name: 'Путешествия',    type: 'EXPENSE', iconKey: 'travel',        colorKey: 'emerald' },
    { name: 'Дом',            type: 'EXPENSE', iconKey: 'home',          colorKey: 'orange'  },
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

  // ── Transactions ─────────────────────────────────────────────────────────────
  //
  // 6 months of data. Each month has:
  //   • Salary on ~day 5 of the month
  //   • 1-2 freelance / side-income entries
  //   • Monthly rent (~155 000 ₸), bills (~26 000), subscriptions (~6 000)
  //   • 4 grocery runs, 8-10 coffee/transport entries, 2-3 cafes
  //   • 1-3 shopping, 1-2 entertainment, occasional health/travel/home
  //
  // Emotion distribution intended:
  //   NEUTRAL ≈ 45 %  (routine)
  //   HAPPY   ≈ 25 %  (salary, cafes, entertainment)
  //   STRESS  ≈ 15 %  (rent, bills, health, rushed transport)
  //   IMPULSIVE ≈ 9 % (late-night shopping)
  //   REGRET  ≈ 6 %   (next-day regret purchases)

  const transactions = [

    // ═══════════════════════════════════════════════════════════════════
    // MONTH 6  (days 151-180 ago)
    // ═══════════════════════════════════════════════════════════════════

    // Income
    { type: 'INCOME',  account: 'Kaspi Gold',      category: 'Зарплата',       amount: 422000, occurredAt: atDaysAgo(177, 9, 10),  emotion: 'HAPPY',     note: 'Зарплата за месяц' },
    { type: 'INCOME',  account: 'Kaspi Gold',       category: 'Фриланс',        amount: 68000,  occurredAt: atDaysAgo(163, 20, 30), emotion: 'HAPPY',     note: 'Проект для клиента из РФ' },
    { type: 'INCOME',  account: 'Freedom Reserve',  category: 'Инвест. доход',  amount: 32000,  occurredAt: atDaysAgo(155, 12, 0),  emotion: 'NEUTRAL',   note: 'Дивиденды по портфелю' },

    // Rent & bills
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Аренда',         amount: 155000, occurredAt: atDaysAgo(179, 10, 0),  emotion: 'STRESS',    note: 'Аренда квартиры' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Счета',          amount: 27200,  occurredAt: atDaysAgo(178, 10, 30), emotion: 'STRESS',    note: 'Коммунальные услуги' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Счета',          amount: 14800,  occurredAt: atDaysAgo(155, 11, 0),  emotion: 'NEUTRAL',   note: 'Интернет и мобильная связь' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Подписки',       amount: 5980,   occurredAt: atDaysAgo(177, 9, 5),   emotion: 'NEUTRAL',   note: 'Netflix, Spotify, iCloud' },

    // Groceries (weekly)
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 16400,  occurredAt: atDaysAgo(176, 18, 30), emotion: 'NEUTRAL',   note: 'Еженедельная закупка' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 15600,  occurredAt: atDaysAgo(169, 18, 20), emotion: 'NEUTRAL',   note: 'Продукты и бытовая химия' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 17200,  occurredAt: atDaysAgo(162, 18, 30), emotion: 'NEUTRAL',   note: 'Закупка на неделю' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 15400,  occurredAt: atDaysAgo(154, 18, 0),  emotion: 'NEUTRAL',   note: 'Продукты и фрукты' },

    // Coffee & transport (daily-ish)
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 1800,   occurredAt: atDaysAgo(175, 8, 40),  emotion: 'HAPPY',     note: 'Кофе и круассан' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 2900,   occurredAt: atDaysAgo(174, 8, 30),  emotion: 'NEUTRAL',   note: 'Такси на работу' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 2000,   occurredAt: atDaysAgo(172, 15, 30), emotion: 'NEUTRAL',   note: 'Кофе после обеда' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 3200,   occurredAt: atDaysAgo(171, 8, 40),  emotion: 'STRESS',    note: 'Такси — опаздывал' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 1900,   occurredAt: atDaysAgo(168, 16, 0),  emotion: 'HAPPY',     note: 'Кофе с коллегой' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 2700,   occurredAt: atDaysAgo(167, 8, 20),  emotion: 'NEUTRAL',   note: 'Поездка в центр' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 2100,   occurredAt: atDaysAgo(165, 15, 0),  emotion: 'NEUTRAL',   note: 'Обеденный перекус' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 3100,   occurredAt: atDaysAgo(161, 8, 30),  emotion: 'NEUTRAL',   note: 'Такси вечером' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 1700,   occurredAt: atDaysAgo(158, 16, 20), emotion: 'HAPPY',     note: 'Кофе утром' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 2500,   occurredAt: atDaysAgo(153, 8, 30),  emotion: 'NEUTRAL',   note: 'Утренняя поездка' },

    // Cafes & restaurants
    { type: 'EXPENSE', account: 'Travel Envelope',  category: 'Кафе и рестораны', amount: 9100, occurredAt: atDaysAgo(172, 20, 30), emotion: 'HAPPY',     note: 'Ужин с коллегами' },
    { type: 'EXPENSE', account: 'Travel Envelope',  category: 'Кафе и рестораны', amount: 8800, occurredAt: atDaysAgo(154, 20, 30), emotion: 'HAPPY',     note: 'Встреча с друзьями в кафе' },

    // Shopping
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Покупки',        amount: 36000,  occurredAt: atDaysAgo(165, 22, 15), emotion: 'IMPULSIVE', note: 'Спонтанный заказ одежды поздно ночью' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Покупки',        amount: 22000,  occurredAt: atDaysAgo(157, 23, 0),  emotion: 'REGRET',    note: 'Купил, в итоге не пригодилось' },

    // Entertainment & health
    { type: 'EXPENSE', account: 'Travel Envelope',  category: 'Развлечения',    amount: 12500,  occurredAt: atDaysAgo(159, 21, 30), emotion: 'HAPPY',     note: 'Концерт + ужин' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Здоровье',       amount: 14000,  occurredAt: atDaysAgo(164, 10, 0),  emotion: 'STRESS',    note: 'Поход к врачу и анализы' },

    // ═══════════════════════════════════════════════════════════════════
    // MONTH 5  (days 121-150 ago)
    // ═══════════════════════════════════════════════════════════════════

    // Income
    { type: 'INCOME',  account: 'Kaspi Gold',       category: 'Зарплата',       amount: 428000, occurredAt: atDaysAgo(147, 9, 5),   emotion: 'HAPPY',     note: 'Зарплата — небольшое повышение' },
    { type: 'INCOME',  account: 'Kaspi Gold',       category: 'Фриланс',        amount: 85000,  occurredAt: atDaysAgo(135, 21, 0),  emotion: 'HAPPY',     note: 'Оплата за UI-аудит' },

    // Rent & bills
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Аренда',         amount: 155000, occurredAt: atDaysAgo(149, 10, 0),  emotion: 'STRESS',    note: 'Аренда квартиры' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Счета',          amount: 25800,  occurredAt: atDaysAgo(148, 10, 30), emotion: 'STRESS',    note: 'Коммунальные услуги' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Счета',          amount: 15200,  occurredAt: atDaysAgo(129, 11, 0),  emotion: 'NEUTRAL',   note: 'Интернет и связь' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Подписки',       amount: 5980,   occurredAt: atDaysAgo(147, 9, 0),   emotion: 'NEUTRAL',   note: 'Месячные подписки' },

    // Groceries
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 15800,  occurredAt: atDaysAgo(146, 18, 30), emotion: 'NEUTRAL',   note: 'Еженедельная закупка' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 16600,  occurredAt: atDaysAgo(139, 18, 20), emotion: 'NEUTRAL',   note: 'Продукты на неделю' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 16200,  occurredAt: atDaysAgo(132, 18, 30), emotion: 'NEUTRAL',   note: 'Закупка и фрукты' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 15000,  occurredAt: atDaysAgo(124, 18, 0),  emotion: 'NEUTRAL',   note: 'Минимальная закупка' },

    // Coffee & transport
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 2200,   occurredAt: atDaysAgo(145, 8, 40),  emotion: 'HAPPY',     note: 'Двойной кофе и ватрушка' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 2800,   occurredAt: atDaysAgo(144, 8, 30),  emotion: 'NEUTRAL',   note: 'Такси на встречу' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 1900,   occurredAt: atDaysAgo(141, 16, 10), emotion: 'HAPPY',     note: 'Кофе с коллегой' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 3000,   occurredAt: atDaysAgo(140, 8, 30),  emotion: 'STRESS',    note: 'Пробка — такси дорогой' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 2000,   occurredAt: atDaysAgo(137, 16, 20), emotion: 'NEUTRAL',   note: 'Перекус' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 2900,   occurredAt: atDaysAgo(136, 8, 20),  emotion: 'NEUTRAL',   note: 'Поездка домой' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 1800,   occurredAt: atDaysAgo(133, 16, 40), emotion: 'NEUTRAL',   note: 'Чай и пирожок' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 3200,   occurredAt: atDaysAgo(130, 8, 30),  emotion: 'NEUTRAL',   note: 'Такси в выходной' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 2100,   occurredAt: atDaysAgo(126, 16, 0),  emotion: 'HAPPY',     note: 'Кофе в хорошую погоду' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 2600,   occurredAt: atDaysAgo(122, 8, 30),  emotion: 'NEUTRAL',   note: 'Утренняя поездка' },

    // Cafes
    { type: 'EXPENSE', account: 'Travel Envelope',  category: 'Кафе и рестораны', amount: 10200, occurredAt: atDaysAgo(142, 20, 0),  emotion: 'HAPPY',     note: 'Ужин в итальянском ресторане' },
    { type: 'EXPENSE', account: 'Travel Envelope',  category: 'Кафе и рестораны', amount: 7800,  occurredAt: atDaysAgo(127, 20, 0),  emotion: 'HAPPY',     note: 'Посидели с другом' },

    // Shopping
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Покупки',        amount: 44000,  occurredAt: atDaysAgo(137, 23, 0),  emotion: 'IMPULSIVE', note: 'Заказал кроссовки не глядя' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Покупки',        amount: 19000,  occurredAt: atDaysAgo(128, 22, 30), emotion: 'REGRET',    note: 'Купил — не понравилось' },

    // Home & health & entertainment
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Дом',            amount: 28000,  occurredAt: atDaysAgo(135, 13, 0),  emotion: 'NEUTRAL',   note: 'Покупки для дома' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Здоровье',       amount: 16000,  occurredAt: atDaysAgo(131, 10, 0),  emotion: 'STRESS',    note: 'Поликлиника и аптека' },
    { type: 'EXPENSE', account: 'Travel Envelope',  category: 'Развлечения',    amount: 9500,   occurredAt: atDaysAgo(132, 21, 30), emotion: 'HAPPY',     note: 'Кино и боулинг' },
    { type: 'EXPENSE', account: 'Travel Envelope',  category: 'Развлечения',    amount: 8000,   occurredAt: atDaysAgo(123, 21, 30), emotion: 'IMPULSIVE', note: 'Спонтанно пошли на вечеринку' },

    // ═══════════════════════════════════════════════════════════════════
    // MONTH 4  (days 91-120 ago)
    // ═══════════════════════════════════════════════════════════════════

    // Income
    { type: 'INCOME',  account: 'Kaspi Gold',       category: 'Зарплата',       amount: 435000, occurredAt: atDaysAgo(117, 9, 0),   emotion: 'HAPPY',     note: 'Зарплата' },
    { type: 'INCOME',  account: 'Kaspi Gold',       category: 'Фриланс',        amount: 92000,  occurredAt: atDaysAgo(105, 20, 30), emotion: 'HAPPY',     note: 'Разработка мобильного приложения' },
    { type: 'INCOME',  account: 'Kaspi Gold',       category: 'Бонус',          amount: 50000,  occurredAt: atDaysAgo(100, 11, 0),  emotion: 'HAPPY',     note: 'Квартальный KPI-бонус' },

    // Rent & bills
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Аренда',         amount: 155000, occurredAt: atDaysAgo(119, 10, 0),  emotion: 'STRESS',    note: 'Аренда квартиры' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Счета',          amount: 28500,  occurredAt: atDaysAgo(118, 10, 0),  emotion: 'STRESS',    note: 'Коммунальные — зима, отопление дороже' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Счета',          amount: 15600,  occurredAt: atDaysAgo(100, 11, 0),  emotion: 'NEUTRAL',   note: 'Интернет и связь' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Подписки',       amount: 7980,   occurredAt: atDaysAgo(117, 9, 5),   emotion: 'NEUTRAL',   note: 'Netflix, Spotify, iCloud, ChatGPT' },

    // Groceries
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 17200,  occurredAt: atDaysAgo(116, 18, 30), emotion: 'NEUTRAL',   note: 'Еженедельная закупка' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 15600,  occurredAt: atDaysAgo(109, 18, 20), emotion: 'NEUTRAL',   note: 'Продукты и снеки' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 16800,  occurredAt: atDaysAgo(102, 18, 30), emotion: 'NEUTRAL',   note: 'Закупка' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 15400,  occurredAt: atDaysAgo(95, 18, 0),   emotion: 'NEUTRAL',   note: 'Мини-закупка к выходным' },

    // Coffee & transport
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 2300,   occurredAt: atDaysAgo(115, 8, 40),  emotion: 'HAPPY',     note: 'Любимое кофе' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 3100,   occurredAt: atDaysAgo(114, 8, 30),  emotion: 'NEUTRAL',   note: 'Такси' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 1900,   occurredAt: atDaysAgo(111, 16, 0),  emotion: 'HAPPY',     note: 'Кофе-брейк' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 2700,   occurredAt: atDaysAgo(110, 8, 30),  emotion: 'STRESS',    note: 'Экстренное такси' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 2100,   occurredAt: atDaysAgo(107, 15, 0),  emotion: 'NEUTRAL',   note: 'Послеобеденный кофе' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 3400,   occurredAt: atDaysAgo(106, 8, 20),  emotion: 'NEUTRAL',   note: 'Поездка по городу' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 2000,   occurredAt: atDaysAgo(103, 16, 40), emotion: 'NEUTRAL',   note: 'Перекус' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 2800,   occurredAt: atDaysAgo(97, 8, 40),   emotion: 'NEUTRAL',   note: 'Такси домой вечером' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 1800,   occurredAt: atDaysAgo(96, 16, 0),   emotion: 'HAPPY',     note: 'Кофе утром' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 3100,   occurredAt: atDaysAgo(93, 8, 30),   emotion: 'STRESS',    note: 'Дождь, такси дорогой' },

    // Cafes
    { type: 'EXPENSE', account: 'Travel Envelope',  category: 'Кафе и рестораны', amount: 11500, occurredAt: atDaysAgo(112, 20, 20), emotion: 'HAPPY',     note: 'Романтический ужин' },
    { type: 'EXPENSE', account: 'Travel Envelope',  category: 'Кафе и рестораны', amount: 9300,  occurredAt: atDaysAgo(98, 20, 0),   emotion: 'HAPPY',     note: 'Ужин с родителями' },

    // Shopping
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Покупки',        amount: 51000,  occurredAt: atDaysAgo(107, 22, 0),  emotion: 'IMPULSIVE', note: 'Наушники без раздумий в 22:00' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Покупки',        amount: 28000,  occurredAt: atDaysAgo(94, 22, 30),  emotion: 'REGRET',    note: 'Купил, не нужно было' },

    // Entertainment, health, travel
    { type: 'EXPENSE', account: 'Travel Envelope',  category: 'Развлечения',    amount: 14000,  occurredAt: atDaysAgo(103, 21, 0),  emotion: 'HAPPY',     note: 'Квест и пицца с компанией' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Здоровье',       amount: 12000,  occurredAt: atDaysAgo(102, 10, 0),  emotion: 'STRESS',    note: 'Стоматолог' },
    { type: 'EXPENSE', account: 'Travel Envelope',  category: 'Путешествия',    amount: 65000,  occurredAt: atDaysAgo(99, 14, 30),  emotion: 'HAPPY',     note: 'Выходные в горах — отель + еда' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 1900,   occurredAt: atDaysAgo(92, 16, 10),  emotion: 'HAPPY',     note: 'Кофе на прогулке' },

    // ═══════════════════════════════════════════════════════════════════
    // MONTH 3  (days 61-90 ago)
    // ═══════════════════════════════════════════════════════════════════

    // Income
    { type: 'INCOME',  account: 'Kaspi Gold',       category: 'Зарплата',       amount: 432000, occurredAt: atDaysAgo(87, 9, 10),   emotion: 'HAPPY',     note: 'Зарплата' },
    { type: 'INCOME',  account: 'Kaspi Gold',       category: 'Фриланс',        amount: 78000,  occurredAt: atDaysAgo(75, 21, 0),   emotion: 'HAPPY',     note: 'Поддержка сайта — полгода работы' },
    { type: 'INCOME',  account: 'Freedom Reserve',  category: 'Инвест. доход',  amount: 41000,  occurredAt: atDaysAgo(66, 12, 0),   emotion: 'NEUTRAL',   note: 'Купонный доход по облигациям' },

    // Rent & bills
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Аренда',         amount: 160000, occurredAt: atDaysAgo(89, 10, 0),   emotion: 'STRESS',    note: 'Аренда — хозяин поднял на 5 000' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Счета',          amount: 26700,  occurredAt: atDaysAgo(88, 10, 30),  emotion: 'STRESS',    note: 'Коммунальные услуги' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Счета',          amount: 15000,  occurredAt: atDaysAgo(70, 11, 0),   emotion: 'NEUTRAL',   note: 'Интернет и связь' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Подписки',       amount: 5980,   occurredAt: atDaysAgo(87, 9, 5),    emotion: 'NEUTRAL',   note: 'Подписки' },

    // Groceries
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 16100,  occurredAt: atDaysAgo(86, 18, 30),  emotion: 'NEUTRAL',   note: 'Закупка на неделю' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 15800,  occurredAt: atDaysAgo(79, 18, 20),  emotion: 'NEUTRAL',   note: 'Продукты' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 17500,  occurredAt: atDaysAgo(72, 18, 30),  emotion: 'NEUTRAL',   note: 'Закупка + мясо для шашлыка' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 15200,  occurredAt: atDaysAgo(64, 18, 0),   emotion: 'NEUTRAL',   note: 'Обычная закупка' },

    // Coffee & transport
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 2000,   occurredAt: atDaysAgo(85, 8, 40),   emotion: 'HAPPY',     note: 'Утренний ритуал' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 2900,   occurredAt: atDaysAgo(84, 8, 30),   emotion: 'NEUTRAL',   note: 'Такси' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 2100,   occurredAt: atDaysAgo(81, 16, 0),   emotion: 'HAPPY',     note: 'Кофе с молоком' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 3200,   occurredAt: atDaysAgo(80, 8, 30),   emotion: 'STRESS',    note: 'Опоздание — срочно такси' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 1800,   occurredAt: atDaysAgo(77, 15, 20),  emotion: 'NEUTRAL',   note: 'Кофе перед встречей' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 2700,   occurredAt: atDaysAgo(76, 8, 20),   emotion: 'NEUTRAL',   note: 'Поездка в ТЦ' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 2200,   occurredAt: atDaysAgo(73, 16, 40),  emotion: 'HAPPY',     note: 'Кофе + десерт' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 3000,   occurredAt: atDaysAgo(69, 8, 30),   emotion: 'NEUTRAL',   note: 'Вечерняя поездка' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 1900,   occurredAt: atDaysAgo(68, 16, 0),   emotion: 'HAPPY',     note: 'Вкусный кофе' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 2800,   occurredAt: atDaysAgo(63, 8, 30),   emotion: 'NEUTRAL',   note: 'Такси домой' },

    // Cafes
    { type: 'EXPENSE', account: 'Travel Envelope',  category: 'Кафе и рестораны', amount: 9800,  occurredAt: atDaysAgo(82, 20, 30),  emotion: 'HAPPY',     note: 'Воскресный бранч' },
    { type: 'EXPENSE', account: 'Travel Envelope',  category: 'Кафе и рестораны', amount: 8200,  occurredAt: atDaysAgo(64, 20, 0),   emotion: 'HAPPY',     note: 'Ужин в новом месте' },

    // Shopping
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Покупки',        amount: 32000,  occurredAt: atDaysAgo(77, 23, 0),   emotion: 'IMPULSIVE', note: 'Заказал вещи после серфинга рекламы' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Покупки',        amount: 23500,  occurredAt: atDaysAgo(67, 22, 0),   emotion: 'REGRET',    note: 'Снова покупка которую не планировал' },

    // Home, health, entertainment
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Дом',            amount: 35000,  occurredAt: atDaysAgo(66, 13, 30),  emotion: 'NEUTRAL',   note: 'Новый пылесос' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Здоровье',       amount: 11000,  occurredAt: atDaysAgo(74, 10, 0),   emotion: 'STRESS',    note: 'Аптека — заболел' },
    { type: 'EXPENSE', account: 'Travel Envelope',  category: 'Развлечения',    amount: 13000,  occurredAt: atDaysAgo(71, 21, 0),   emotion: 'HAPPY',     note: 'День рождения друга — ресторан' },

    // ═══════════════════════════════════════════════════════════════════
    // MONTH 2  (days 31-60 ago)
    // ═══════════════════════════════════════════════════════════════════

    // Income
    { type: 'INCOME',  account: 'Kaspi Gold',       category: 'Зарплата',       amount: 440000, occurredAt: atDaysAgo(57, 9, 5),    emotion: 'HAPPY',     note: 'Зарплата' },
    { type: 'INCOME',  account: 'Kaspi Gold',       category: 'Фриланс',        amount: 95000,  occurredAt: atDaysAgo(45, 20, 30),  emotion: 'HAPPY',     note: 'Разработка интернет-магазина' },
    { type: 'INCOME',  account: 'Freedom Reserve',  category: 'Инвест. доход',  amount: 38000,  occurredAt: atDaysAgo(41, 12, 0),   emotion: 'NEUTRAL',   note: 'Дивиденды' },

    // Rent & bills
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Аренда',         amount: 160000, occurredAt: atDaysAgo(59, 10, 0),   emotion: 'STRESS',    note: 'Аренда квартиры' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Счета',          amount: 29000,  occurredAt: atDaysAgo(58, 10, 30),  emotion: 'STRESS',    note: 'Коммунальные услуги' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Счета',          amount: 14700,  occurredAt: atDaysAgo(40, 11, 0),   emotion: 'NEUTRAL',   note: 'Интернет и связь' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Подписки',       amount: 5980,   occurredAt: atDaysAgo(57, 9, 5),    emotion: 'NEUTRAL',   note: 'Подписки' },

    // Groceries
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 17800,  occurredAt: atDaysAgo(56, 18, 30),  emotion: 'NEUTRAL',   note: 'Закупка с запасом' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 16100,  occurredAt: atDaysAgo(49, 18, 20),  emotion: 'NEUTRAL',   note: 'Продукты на неделю' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 15500,  occurredAt: atDaysAgo(42, 18, 30),  emotion: 'NEUTRAL',   note: 'Закупка' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 16800,  occurredAt: atDaysAgo(35, 18, 0),   emotion: 'NEUTRAL',   note: 'Продукты и фрукты' },

    // Coffee & transport
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 2100,   occurredAt: atDaysAgo(55, 8, 40),   emotion: 'HAPPY',     note: 'Кофе утром' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 3100,   occurredAt: atDaysAgo(54, 8, 30),   emotion: 'NEUTRAL',   note: 'Такси на работу' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 2300,   occurredAt: atDaysAgo(51, 16, 0),   emotion: 'HAPPY',     note: 'Холодный кофе в жаркий день' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 2800,   occurredAt: atDaysAgo(50, 8, 30),   emotion: 'STRESS',    note: 'Спешил — взял такси' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 1900,   occurredAt: atDaysAgo(47, 15, 20),  emotion: 'NEUTRAL',   note: 'Перекус' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 3000,   occurredAt: atDaysAgo(46, 8, 20),   emotion: 'NEUTRAL',   note: 'Поездка' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 1800,   occurredAt: atDaysAgo(43, 16, 40),  emotion: 'NEUTRAL',   note: 'Кофе' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 2900,   occurredAt: atDaysAgo(39, 8, 40),   emotion: 'NEUTRAL',   note: 'Такси' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 2000,   occurredAt: atDaysAgo(37, 16, 0),   emotion: 'HAPPY',     note: 'Кофе с другом' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 3200,   occurredAt: atDaysAgo(33, 8, 30),   emotion: 'STRESS',    note: 'Дождь — такси дорого' },

    // Cafes
    { type: 'EXPENSE', account: 'Travel Envelope',  category: 'Кафе и рестораны', amount: 11200, occurredAt: atDaysAgo(52, 20, 30),  emotion: 'HAPPY',     note: 'Ужин по поводу повышения' },
    { type: 'EXPENSE', account: 'Travel Envelope',  category: 'Кафе и рестораны', amount: 9500,  occurredAt: atDaysAgo(38, 20, 0),   emotion: 'HAPPY',     note: 'Выходной в ресторане' },

    // Shopping
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Покупки',        amount: 45000,  occurredAt: atDaysAgo(47, 23, 0),   emotion: 'IMPULSIVE', note: 'Ночной шоппинг — сильно пожалел' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Покупки',        amount: 31000,  occurredAt: atDaysAgo(39, 22, 30),  emotion: 'REGRET',    note: 'Купил очередную ненужную вещь' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Покупки',        amount: 22000,  occurredAt: atDaysAgo(34, 22, 0),   emotion: 'NEUTRAL',   note: 'Новая рубашка к собеседованию' },

    // Home, health, entertainment
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Здоровье',       amount: 17000,  occurredAt: atDaysAgo(42, 10, 0),   emotion: 'STRESS',    note: 'Стоматолог — неожиданно дорого' },
    { type: 'EXPENSE', account: 'Travel Envelope',  category: 'Развлечения',    amount: 11000,  occurredAt: atDaysAgo(43, 21, 30),  emotion: 'HAPPY',     note: 'Кино в IMAX с подругой' },
    { type: 'EXPENSE', account: 'Travel Envelope',  category: 'Путешествия',    amount: 85000,  occurredAt: atDaysAgo(36, 14, 0),   emotion: 'HAPPY',     note: 'Поездка в Алмату на выходные' },

    // ═══════════════════════════════════════════════════════════════════
    // MONTH 1  (days 1-30 ago)
    // ═══════════════════════════════════════════════════════════════════

    // Income
    { type: 'INCOME',  account: 'Kaspi Gold',       category: 'Зарплата',       amount: 445000, occurredAt: atDaysAgo(27, 9, 5),    emotion: 'HAPPY',     note: 'Зарплата — проиндексировали' },
    { type: 'INCOME',  account: 'Kaspi Gold',       category: 'Фриланс',        amount: 88000,  occurredAt: atDaysAgo(18, 21, 0),   emotion: 'HAPPY',     note: 'Редизайн корпоративного сайта' },
    { type: 'INCOME',  account: 'Kaspi Gold',       category: 'Бонус',          amount: 45000,  occurredAt: atDaysAgo(10, 12, 0),   emotion: 'HAPPY',     note: 'Бонус за успешный запуск проекта' },
    { type: 'INCOME',  account: 'Kaspi Gold',       category: 'Возврат',        amount: 12000,  occurredAt: atDaysAgo(7, 14, 30),   emotion: 'NEUTRAL',   note: 'Возврат за отмененный рейс' },

    // Rent & bills
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Аренда',         amount: 160000, occurredAt: atDaysAgo(29, 10, 0),   emotion: 'STRESS',    note: 'Аренда квартиры' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Счета',          amount: 26500,  occurredAt: atDaysAgo(28, 10, 30),  emotion: 'STRESS',    note: 'Коммунальные услуги' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Счета',          amount: 15800,  occurredAt: atDaysAgo(12, 11, 0),   emotion: 'NEUTRAL',   note: 'Интернет и связь' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Подписки',       amount: 5980,   occurredAt: atDaysAgo(27, 9, 0),    emotion: 'NEUTRAL',   note: 'Подписки' },

    // Groceries
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 17100,  occurredAt: atDaysAgo(28, 18, 30),  emotion: 'NEUTRAL',   note: 'Большая закупка' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 15900,  occurredAt: atDaysAgo(21, 18, 20),  emotion: 'NEUTRAL',   note: 'Продукты' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 17600,  occurredAt: atDaysAgo(14, 18, 30),  emotion: 'NEUTRAL',   note: 'Закупка с друзьями' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 16300,  occurredAt: atDaysAgo(7, 18, 30),   emotion: 'NEUTRAL',   note: 'Еженедельная закупка' },

    // Coffee & transport
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 2200,   occurredAt: atDaysAgo(27, 8, 40),   emotion: 'HAPPY',     note: 'Кофе с бонусом в день зарплаты' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 2900,   occurredAt: atDaysAgo(26, 8, 30),   emotion: 'NEUTRAL',   note: 'Такси' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 2000,   occurredAt: atDaysAgo(23, 16, 0),   emotion: 'HAPPY',     note: 'Кофе' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 3100,   occurredAt: atDaysAgo(22, 8, 30),   emotion: 'STRESS',    note: 'Срочная поездка' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 1900,   occurredAt: atDaysAgo(19, 15, 20),  emotion: 'NEUTRAL',   note: 'Перекус' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 2800,   occurredAt: atDaysAgo(18, 8, 20),   emotion: 'NEUTRAL',   note: 'Поездка' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 2100,   occurredAt: atDaysAgo(15, 16, 40),  emotion: 'NEUTRAL',   note: 'Кофе и снеки' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 3000,   occurredAt: atDaysAgo(11, 8, 30),   emotion: 'NEUTRAL',   note: 'Такси домой' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 1900,   occurredAt: atDaysAgo(9, 16, 0),    emotion: 'HAPPY',     note: 'Кофе в парке' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 2700,   occurredAt: atDaysAgo(5, 8, 30),    emotion: 'NEUTRAL',   note: 'Утренняя поездка' },

    // Cafes
    { type: 'EXPENSE', account: 'Travel Envelope',  category: 'Кафе и рестораны', amount: 10400, occurredAt: atDaysAgo(24, 20, 30),  emotion: 'HAPPY',     note: 'Ужин с любимым человеком' },
    { type: 'EXPENSE', account: 'Travel Envelope',  category: 'Кафе и рестораны', amount: 8900,  occurredAt: atDaysAgo(10, 20, 0),   emotion: 'HAPPY',     note: 'Пятничный ужин' },

    // Shopping
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Покупки',        amount: 48000,  occurredAt: atDaysAgo(19, 23, 0),   emotion: 'IMPULSIVE', note: 'Ночной заказ смартфона — пожалел' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Покупки',        amount: 27500,  occurredAt: atDaysAgo(11, 22, 30),  emotion: 'REGRET',    note: 'Еще один ненужный заказ' },

    // Home, health, entertainment, travel
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Дом',            amount: 32000,  occurredAt: atDaysAgo(6, 13, 30),   emotion: 'NEUTRAL',   note: 'Шторы и мелочи для дома' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Здоровье',       amount: 14500,  occurredAt: atDaysAgo(16, 10, 0),   emotion: 'STRESS',    note: 'Профилактика у врача' },
    { type: 'EXPENSE', account: 'Travel Envelope',  category: 'Развлечения',    amount: 10000,  occurredAt: atDaysAgo(14, 21, 30),  emotion: 'HAPPY',     note: 'Спектакль в театре' },

    // ═══════════════════════════════════════════════════════════════════
    // CURRENT WEEK  (days 0-7 ago)
    // ═══════════════════════════════════════════════════════════════════

    // Income
    { type: 'INCOME',  account: 'Kaspi Gold',       category: 'Фриланс',        amount: 72000,  occurredAt: atDaysAgo(3, 21, 0),    emotion: 'HAPPY',     note: 'Предоплата нового проекта' },

    // Rent & bills for current month
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Аренда',         amount: 160000, occurredAt: atDaysAgo(4, 10, 5),    emotion: 'STRESS',    note: 'Аренда квартиры' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Счета',          amount: 27800,  occurredAt: atDaysAgo(4, 10, 30),   emotion: 'STRESS',    note: 'Коммунальные — выросли снова' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Подписки',       amount: 5980,   occurredAt: atDaysAgo(4, 9, 0),     emotion: 'NEUTRAL',   note: 'Ежемесячные подписки' },

    // Groceries
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 16800,  occurredAt: atDaysAgo(3, 18, 30),   emotion: 'NEUTRAL',   note: 'Продукты на неделю' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Продукты',       amount: 15200,  occurredAt: atDaysAgo(1, 18, 20),   emotion: 'NEUTRAL',   note: 'Доп. закупка' },

    // Coffee & transport
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 1900,   occurredAt: atDaysAgo(4, 8, 40),    emotion: 'HAPPY',     note: 'Утренний кофе' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 3100,   occurredAt: atDaysAgo(3, 8, 30),    emotion: 'NEUTRAL',   note: 'Такси' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 2000,   occurredAt: atDaysAgo(2, 16, 0),    emotion: 'NEUTRAL',   note: 'Кофе' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Транспорт',      amount: 2600,   occurredAt: atDaysAgo(2, 8, 15),    emotion: 'NEUTRAL',   note: 'Поездка по делам' },
    { type: 'EXPENSE', account: 'Cash Everyday',    category: 'Кофе и снеки',   amount: 1800,   occurredAt: atDaysAgo(0, 9, 10),    emotion: 'HAPPY',     note: 'Кофе сегодня утром' },

    // Cafes
    { type: 'EXPENSE', account: 'Travel Envelope',  category: 'Кафе и рестораны', amount: 9600,  occurredAt: atDaysAgo(2, 20, 30),   emotion: 'HAPPY',     note: 'Ужин после работы' },

    // Shopping
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Покупки',        amount: 29000,  occurredAt: atDaysAgo(1, 22, 45),   emotion: 'IMPULSIVE', note: 'Поздний онлайн-заказ' },
    { type: 'EXPENSE', account: 'Kaspi Gold',       category: 'Покупки',        amount: 13200,  occurredAt: atDaysAgo(0, 14, 30),   emotion: 'NEUTRAL',   note: 'Нужная покупка заранее продуманная' },
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

  // ── Transfers ─────────────────────────────────────────────────────────────────

  const transfers = [
    // Monthly savings to Freedom Reserve
    {
      fromAccount: 'Kaspi Gold',     toAccount: 'Freedom Reserve',
      fromAmount: 80000,  toAmount: 80000,  exchangeRate: 1,
      occurredAt: atDaysAgo(172, 20, 0),
      note: 'Ежемесячное пополнение резерва',
    },
    {
      fromAccount: 'Kaspi Gold',     toAccount: 'Freedom Reserve',
      fromAmount: 100000, toAmount: 100000, exchangeRate: 1,
      occurredAt: atDaysAgo(145, 19, 0),
      note: 'Пополнение резерва',
    },
    {
      fromAccount: 'Kaspi Gold',     toAccount: 'Freedom Reserve',
      fromAmount: 90000,  toAmount: 90000,  exchangeRate: 1,
      occurredAt: atDaysAgo(115, 20, 0),
      note: 'Ежемесячное пополнение резерва',
    },
    {
      fromAccount: 'Kaspi Gold',     toAccount: 'Freedom Reserve',
      fromAmount: 85000,  toAmount: 85000,  exchangeRate: 1,
      occurredAt: atDaysAgo(85, 20, 0),
      note: 'Пополнение резерва — меньше обычного (были доп. расходы)',
    },
    {
      fromAccount: 'Kaspi Gold',     toAccount: 'Freedom Reserve',
      fromAmount: 95000,  toAmount: 95000,  exchangeRate: 1,
      occurredAt: atDaysAgo(55, 20, 0),
      note: 'Ежемесячное пополнение резерва',
    },
    {
      fromAccount: 'Kaspi Gold',     toAccount: 'Freedom Reserve',
      fromAmount: 90000,  toAmount: 90000,  exchangeRate: 1,
      occurredAt: atDaysAgo(27, 20, 0),
      note: 'Пополнение резерва после зарплаты',
    },
    // Cash withdrawals
    {
      fromAccount: 'Kaspi Gold',     toAccount: 'Cash Everyday',
      fromAmount: 25000,  toAmount: 25000,  exchangeRate: 1,
      occurredAt: atDaysAgo(155, 8, 0),
      note: 'Снятие наличных на месяц',
    },
    {
      fromAccount: 'Kaspi Gold',     toAccount: 'Cash Everyday',
      fromAmount: 30000,  toAmount: 30000,  exchangeRate: 1,
      occurredAt: atDaysAgo(60, 8, 0),
      note: 'Пополнение наличных',
    },
    {
      fromAccount: 'Cash Everyday',  toAccount: 'Kaspi Gold',
      fromAmount: 8000,   toAmount: 8000,   exchangeRate: 1,
      occurredAt: atDaysAgo(14, 18, 45),
      note: 'Вернул остаток наличных на карту',
    },
    // Travel fund top-ups
    {
      fromAccount: 'Kaspi Gold',     toAccount: 'Travel Envelope',
      fromAmount: 80000,  toAmount: 80000,  exchangeRate: 1,
      occurredAt: atDaysAgo(100, 12, 0),
      note: 'Пополнение конверта на путешествия',
    },
    {
      fromAccount: 'Kaspi Gold',     toAccount: 'Travel Envelope',
      fromAmount: 60000,  toAmount: 60000,  exchangeRate: 1,
      occurredAt: atDaysAgo(35, 12, 30),
      note: 'Пополнение перед поездкой в Алмату',
    },
    {
      fromAccount: 'Kaspi Gold',     toAccount: 'Travel Envelope',
      fromAmount: 50000,  toAmount: 50000,  exchangeRate: 1,
      occurredAt: atDaysAgo(5, 11, 0),
      note: 'Пополнение конверта на летние поездки',
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
