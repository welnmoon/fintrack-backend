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

function createRng(seed) {
  let value = seed >>> 0;

  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = createRng(20260608);

function pick(values) {
  return values[Math.floor(rng() * values.length)];
}

function chance(probability) {
  return rng() < probability;
}

function randomInt(min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function money(value, digits = 0) {
  return Number(value.toFixed(digits));
}

function randomAmount(min, max, step = 100) {
  const steps = Math.round((max - min) / step);
  return min + randomInt(0, steps) * step;
}

function atDaysAgo(daysAgo, hour, minute = 0) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date;
}

function atOffset(anchorDaysAgo, offsetDays, hour, minute = 0) {
  return atDaysAgo(Math.max(anchorDaysAgo - offsetDays, 0), hour, minute);
}

function convertAmount(fromAmount, rate) {
  return money(fromAmount * rate, 2);
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
      initialBalance: 245000,
      createdAt: atDaysAgo(215, 10),
    },
    {
      name: 'Freedom USD Reserve',
      type: 'BANK',
      currency: 'USD',
      backgroundKey: 'midnight-indigo',
      initialBalance: 1400,
      createdAt: atDaysAgo(214, 11),
    },
    {
      name: 'Cash Everyday',
      type: 'CASH',
      currency: 'KZT',
      backgroundKey: 'sunset-coral',
      initialBalance: 38000,
      createdAt: atDaysAgo(213, 12),
    },
    {
      name: 'Travel EUR',
      type: 'BANK',
      currency: 'EUR',
      backgroundKey: 'forest-mint',
      initialBalance: 180,
      createdAt: atDaysAgo(212, 13),
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

  await prisma.user.update({
    where: { id: user.id },
    data: { defaultAccountId: accountMap['Kaspi Gold'].id },
  });

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
  // Реалистичнее моделируем 7 месяцев:
  //   • зарплата и нерегулярный фриланс
  //   • отдельный долларовый резерв и EUR-счет для поездок
  //   • коммуналка/аренда/подписки каждый месяц
  //   • повседневные кофе/такси/продукты с разбросом сумм
  //   • иногда корректировки наличных и возвраты

  const transactions = [];

  const groceryNotes = [
    'Еженедельная закупка',
    'Продукты и бытовая химия',
    'Продукты на неделю',
    'Закупка с фруктами и мясом',
  ];
  const coffeeNotes = [
    'Утренний кофе',
    'Кофе перед встречей',
    'Кофе и перекус',
    'Холодный кофе после обеда',
    'Капучино по дороге на работу',
  ];
  const transportNotes = [
    'Такси на работу',
    'Поездка по делам',
    'Такси домой',
    'Поездка в центр',
    'Вечерняя поездка после встречи',
  ];
  const freelanceNotes = [
    'Лендинг для локального бизнеса',
    'Поддержка корпоративного сайта',
    'UI-аудит и правки',
    'Редизайн личного кабинета',
    'Разработка внутреннего дашборда',
  ];
  const refundNotes = [
    'Кэшбэк и возврат комиссии',
    'Возврат за отмененный заказ',
    'Частичный возврат от авиакомпании',
  ];
  const homeNotes = [
    'Мелочи для дома',
    'Покупки для кухни и ванной',
    'Хозтовары и хранение',
    'Текстиль и мелкий декор',
  ];
  const healthNotes = [
    'Аптека и консультация',
    'Стоматолог и снимок',
    'Анализы и прием врача',
    'Профилактический осмотр',
  ];
  const entertainmentNotes = [
    'Кино и ужин',
    'Боулинг с друзьями',
    'Концерт в городе',
    'Спектакль и кофе после',
  ];
  const restaurantNotes = [
    'Ужин с друзьями',
    'Поздний ужин после работы',
    'Воскресный бранч',
    'Ужин в новом месте',
  ];
  const shoppingNotes = {
    IMPULSIVE: [
      'Ночной маркетплейс-заказ без плана',
      'Спонтанно заказал одежду поздно вечером',
      'Купил гаджет после рекламы в соцсетях',
    ],
    REGRET: [
      'Купил, но потом пожалел',
      'Вещь оказалась не нужна',
      'Эмоциональная покупка, потом передумал',
    ],
    NEUTRAL: [
      'Плановая покупка одежды',
      'Обновил базовые вещи',
      'Нужная покупка для работы',
    ],
  };

  const monthProfiles = [
    {
      anchor: 177,
      salary: 418000,
      freelance: [68000],
      invest: 145,
      bonus: 0,
      refund: 0,
      rent: 155000,
      utilities: 27200,
      internet: 14800,
      subscriptions: 5980,
      groceryBase: 15800,
      coffeeBase: 1850,
      transportBase: 2850,
      cafes: [9100, 8800],
      shopping: ['IMPULSIVE', 'REGRET'],
      health: 14000,
      home: 0,
      entertainment: 12500,
      travelExpense: 0,
      cashAdjustment: 0,
    },
    {
      anchor: 147,
      salary: 426000,
      freelance: [52000, 33000],
      invest: 132,
      bonus: 0,
      refund: 0,
      rent: 155000,
      utilities: 25800,
      internet: 15200,
      subscriptions: 5980,
      groceryBase: 16000,
      coffeeBase: 1950,
      transportBase: 2900,
      cafes: [10200, 7800],
      shopping: ['IMPULSIVE', 'REGRET'],
      health: 16000,
      home: 28000,
      entertainment: 9500,
      travelExpense: 0,
      cashAdjustment: 1200,
    },
    {
      anchor: 117,
      salary: 434000,
      freelance: [92000],
      invest: 168,
      bonus: 50000,
      refund: 0,
      rent: 155000,
      utilities: 28500,
      internet: 15600,
      subscriptions: 7980,
      groceryBase: 16500,
      coffeeBase: 2050,
      transportBase: 3000,
      cafes: [11500, 9300],
      shopping: ['IMPULSIVE', 'REGRET'],
      health: 12000,
      home: 0,
      entertainment: 14000,
      travelExpense: 38000,
      cashAdjustment: 0,
    },
    {
      anchor: 87,
      salary: 432000,
      freelance: [78000],
      invest: 176,
      bonus: 0,
      refund: 0,
      rent: 160000,
      utilities: 26700,
      internet: 15000,
      subscriptions: 5980,
      groceryBase: 16300,
      coffeeBase: 1950,
      transportBase: 2900,
      cafes: [9800, 8200],
      shopping: ['IMPULSIVE', 'REGRET'],
      health: 11000,
      home: 35000,
      entertainment: 13000,
      travelExpense: 0,
      cashAdjustment: -2200,
    },
    {
      anchor: 57,
      salary: 440000,
      freelance: [95000],
      invest: 162,
      bonus: 0,
      refund: 0,
      rent: 160000,
      utilities: 29000,
      internet: 14700,
      subscriptions: 5980,
      groceryBase: 16900,
      coffeeBase: 2050,
      transportBase: 3050,
      cafes: [11200, 9500],
      shopping: ['IMPULSIVE', 'REGRET', 'NEUTRAL'],
      health: 17000,
      home: 0,
      entertainment: 11000,
      travelExpense: 85000,
      cashAdjustment: 0,
    },
    {
      anchor: 27,
      salary: 445000,
      freelance: [88000],
      invest: 0,
      bonus: 45000,
      refund: 12000,
      rent: 160000,
      utilities: 26500,
      internet: 15800,
      subscriptions: 5980,
      groceryBase: 17100,
      coffeeBase: 2000,
      transportBase: 2950,
      cafes: [10400, 8900],
      shopping: ['IMPULSIVE', 'REGRET'],
      health: 14500,
      home: 32000,
      entertainment: 10000,
      travelExpense: 0,
      cashAdjustment: 1800,
    },
    {
      anchor: 4,
      salary: 0,
      freelance: [72000],
      invest: 0,
      bonus: 0,
      refund: 0,
      rent: 160000,
      utilities: 27800,
      internet: 0,
      subscriptions: 5980,
      groceryBase: 16000,
      coffeeBase: 1950,
      transportBase: 2850,
      cafes: [9600],
      shopping: ['IMPULSIVE', 'NEUTRAL'],
      health: 0,
      home: 0,
      entertainment: 0,
      travelExpense: 0,
      cashAdjustment: 0,
      shortMonth: true,
    },
  ];

  const addTransaction = ({
    type,
    account,
    category,
    amount,
    occurredAt,
    emotion = null,
    note = null,
  }) => {
    transactions.push({
      type,
      account,
      category,
      amount,
      occurredAt,
      emotion,
      note,
    });
  };

  for (const profile of monthProfiles) {
    if (profile.salary > 0) {
      addTransaction({
        type: 'INCOME',
        account: 'Kaspi Gold',
        category: 'Зарплата',
        amount: profile.salary,
        occurredAt: atOffset(profile.anchor, 0, 9, 5),
        emotion: 'HAPPY',
        note: 'Зарплата за месяц',
      });
    }

    profile.freelance.forEach((amount, index) => {
      addTransaction({
        type: 'INCOME',
        account: 'Kaspi Gold',
        category: 'Фриланс',
        amount,
        occurredAt: atOffset(profile.anchor, 11 + index * 6, 20, 30),
        emotion: 'HAPPY',
        note: pick(freelanceNotes),
      });
    });

    if (profile.invest > 0) {
      addTransaction({
        type: 'INCOME',
        account: 'Freedom USD Reserve',
        category: 'Инвест. доход',
        amount: profile.invest,
        occurredAt: atOffset(profile.anchor, 20, 12, 0),
        emotion: 'NEUTRAL',
        note: 'Дивиденды и купонный доход',
      });
    }

    if (profile.bonus > 0) {
      addTransaction({
        type: 'INCOME',
        account: 'Kaspi Gold',
        category: 'Бонус',
        amount: profile.bonus,
        occurredAt: atOffset(profile.anchor, 16, 12, 0),
        emotion: 'HAPPY',
        note: 'Бонус за результаты месяца',
      });
    }

    if (profile.refund > 0) {
      addTransaction({
        type: 'INCOME',
        account: 'Kaspi Gold',
        category: 'Возврат',
        amount: profile.refund,
        occurredAt: atOffset(profile.anchor, 22, 14, 30),
        emotion: 'NEUTRAL',
        note: pick(refundNotes),
      });
    }

    addTransaction({
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Аренда',
      amount: profile.rent,
      occurredAt: atOffset(profile.anchor, 2, 10, 0),
      emotion: 'STRESS',
      note: 'Аренда квартиры',
    });
    addTransaction({
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Счета',
      amount: profile.utilities,
      occurredAt: atOffset(profile.anchor, 2, 10, 35),
      emotion: 'STRESS',
      note: 'Коммунальные услуги',
    });
    if (profile.internet > 0) {
      addTransaction({
        type: 'EXPENSE',
        account: 'Kaspi Gold',
        category: 'Счета',
        amount: profile.internet,
        occurredAt: atOffset(profile.anchor, 19, 11, 0),
        emotion: 'NEUTRAL',
        note: 'Интернет и мобильная связь',
      });
    }
    addTransaction({
      type: 'EXPENSE',
      account: 'Kaspi Gold',
      category: 'Подписки',
      amount: profile.subscriptions,
      occurredAt: atOffset(profile.anchor, 0, 9, 0),
      emotion: 'NEUTRAL',
      note: 'Подписки: музыка, облако, видео',
    });

    const groceryOffsets = profile.shortMonth ? [1, 3] : [1, 8, 15, 22];
    groceryOffsets.forEach((offset, index) => {
      addTransaction({
        type: 'EXPENSE',
        account: 'Kaspi Gold',
        category: 'Продукты',
        amount: randomAmount(
          profile.groceryBase - 1700,
          profile.groceryBase + 1900,
          100,
        ),
        occurredAt: atOffset(profile.anchor, offset, 18, 15 + (index % 3) * 10),
        emotion: 'NEUTRAL',
        note: groceryNotes[index % groceryNotes.length],
      });
    });

    const commuteOffsets = profile.shortMonth
      ? [0, 1, 2, 3, 4]
      : [0, 2, 4, 7, 9, 11, 14, 17, 20, 23];
    commuteOffsets.forEach((offset, index) => {
      const isCoffee = index % 2 === 0;
      addTransaction({
        type: 'EXPENSE',
        account: 'Cash Everyday',
        category: isCoffee ? 'Кофе и снеки' : 'Транспорт',
        amount: isCoffee
          ? randomAmount(profile.coffeeBase - 300, profile.coffeeBase + 400, 100)
          : randomAmount(
              profile.transportBase - 400,
              profile.transportBase + 500,
              100,
            ),
        occurredAt: atOffset(
          profile.anchor,
          offset,
          isCoffee ? (index % 4 === 0 ? 8 : 16) : 8,
          isCoffee ? 40 - (index % 3) * 10 : 20 + (index % 2) * 10,
        ),
        emotion: isCoffee
          ? chance(0.55)
            ? 'HAPPY'
            : 'NEUTRAL'
          : chance(0.28)
            ? 'STRESS'
            : 'NEUTRAL',
        note: pick(isCoffee ? coffeeNotes : transportNotes),
      });
    });

    profile.cafes.forEach((amount, index) => {
      addTransaction({
        type: 'EXPENSE',
        account: 'Travel EUR',
        category: 'Кафе и рестораны',
        amount: money(amount / 510, 2),
        occurredAt: atOffset(profile.anchor, 6 + index * 13, 20, 20),
        emotion: 'HAPPY',
        note: pick(restaurantNotes),
      });
    });

    profile.shopping.forEach((emotion, index) => {
      addTransaction({
        type: 'EXPENSE',
        account: 'Kaspi Gold',
        category: 'Покупки',
        amount:
          emotion === 'IMPULSIVE'
            ? randomAmount(34000, 52000, 500)
            : emotion === 'REGRET'
              ? randomAmount(18000, 32000, 500)
              : randomAmount(12000, 24000, 500),
        occurredAt: atOffset(profile.anchor, 10 + index * 8, 22, 15),
        emotion,
        note: pick(shoppingNotes[emotion]),
      });
    });

    if (profile.home > 0) {
      addTransaction({
        type: 'EXPENSE',
        account: 'Kaspi Gold',
        category: 'Дом',
        amount: profile.home,
        occurredAt: atOffset(profile.anchor, 12, 13, 10),
        emotion: 'NEUTRAL',
        note: pick(homeNotes),
      });
    }

    if (profile.health > 0) {
      addTransaction({
        type: 'EXPENSE',
        account: 'Kaspi Gold',
        category: 'Здоровье',
        amount: profile.health,
        occurredAt: atOffset(profile.anchor, 14, 10, 0),
        emotion: 'STRESS',
        note: pick(healthNotes),
      });
    }

    if (profile.entertainment > 0) {
      addTransaction({
        type: 'EXPENSE',
        account: 'Travel EUR',
        category: 'Развлечения',
        amount: money(profile.entertainment / 510, 2),
        occurredAt: atOffset(profile.anchor, 15, 21, 10),
        emotion: chance(0.2) ? 'IMPULSIVE' : 'HAPPY',
        note: pick(entertainmentNotes),
      });
    }

    if (profile.travelExpense > 0) {
      addTransaction({
        type: 'EXPENSE',
        account: 'Travel EUR',
        category: 'Путешествия',
        amount: money(profile.travelExpense / 510, 2),
        occurredAt: atOffset(profile.anchor, 18, 14, 0),
        emotion: 'HAPPY',
        note: 'Поездка и расходы в другой город',
      });
    }

    if (profile.cashAdjustment !== 0) {
      addTransaction({
        type: 'ADJUSTMENT',
        account: 'Cash Everyday',
        category: null,
        amount: money(
          42000 + randomAmount(-3000, 3000, 100) + profile.cashAdjustment,
          2,
        ),
        occurredAt: atOffset(profile.anchor, 24, 22, 45),
        emotion: 'NEUTRAL',
        note: 'Пересчет наличных после месяца',
      });
    }
  }

  await prisma.transaction.createMany({
    data: transactions.map((transaction) => ({
      userId: user.id,
      accountId: accountMap[transaction.account].id,
      categoryId: transaction.category
        ? categoryMap[`${transaction.type}:${transaction.category}`]
        : null,
      type: transaction.type,
      emotion: transaction.emotion,
      amount: transaction.amount,
      occurredAt: transaction.occurredAt,
      note: transaction.note,
    })),
  });

  // ── Transfers ─────────────────────────────────────────────────────────────────

  const transfers = [];

  const reserveTopUps = [
    { anchor: 177, amount: 85000, rate: 1 / 475.6, note: 'Перевел часть зарплаты в долларовый резерв' },
    { anchor: 147, amount: 92000, rate: 1 / 472.4, note: 'Пополнение USD-резерва после зарплаты' },
    { anchor: 117, amount: 98000, rate: 1 / 469.8, note: 'Резерв в долларах на подушку' },
    { anchor: 87, amount: 76000, rate: 1 / 471.2, note: 'Меньше обычного — были доп. траты' },
    { anchor: 57, amount: 101000, rate: 1 / 468.5, note: 'Пополнение резерва после крупного проекта' },
    { anchor: 27, amount: 94000, rate: 1 / 466.7, note: 'Плановое пополнение USD-счета' },
  ];

  reserveTopUps.forEach((item) => {
    transfers.push({
      fromAccount: 'Kaspi Gold',
      toAccount: 'Freedom USD Reserve',
      fromAmount: item.amount,
      toAmount: convertAmount(item.amount, item.rate),
      exchangeRate: money(item.rate, 8),
      occurredAt: atOffset(item.anchor, 1, 19, 10),
      note: item.note,
    });
  });

  [
    { daysAgo: 160, amount: 30000, note: 'Снятие наличных на месяц' },
    { daysAgo: 96, amount: 25000, note: 'Пополнение наличных перед поездками по городу' },
    { daysAgo: 40, amount: 35000, note: 'Наличные на бытовые расходы' },
    { daysAgo: 5, amount: 20000, note: 'Наличные на неделю' },
  ].forEach((item) => {
    transfers.push({
      fromAccount: 'Kaspi Gold',
      toAccount: 'Cash Everyday',
      fromAmount: item.amount,
      toAmount: item.amount,
      exchangeRate: 1,
      occurredAt: atDaysAgo(item.daysAgo, 8, 0),
      note: item.note,
    });
  });

  [
    { daysAgo: 118, amount: 90000, rate: 1 / 512.5, note: 'Сформировал бюджет поездки в EUR' },
    { daysAgo: 34, amount: 110000, rate: 1 / 505.9, note: 'Пополнение EUR-счета перед отпуском' },
    { daysAgo: 6, amount: 65000, rate: 1 / 503.2, note: 'Небольшое пополнение на летние поездки' },
  ].forEach((item) => {
    transfers.push({
      fromAccount: 'Kaspi Gold',
      toAccount: 'Travel EUR',
      fromAmount: item.amount,
      toAmount: convertAmount(item.amount, item.rate),
      exchangeRate: money(item.rate, 8),
      occurredAt: atDaysAgo(item.daysAgo, 12, 20),
      note: item.note,
    });
  });

  transfers.push(
    {
      fromAccount: 'Cash Everyday',
      toAccount: 'Kaspi Gold',
      fromAmount: 12000,
      toAmount: 12000,
      exchangeRate: 1,
      occurredAt: atDaysAgo(14, 18, 45),
      note: 'Вернул остаток наличных на карту',
    },
    {
      fromAccount: 'Freedom USD Reserve',
      toAccount: 'Kaspi Gold',
      fromAmount: 95,
      toAmount: convertAmount(95, 468.9),
      exchangeRate: 468.9,
      occurredAt: atDaysAgo(9, 13, 10),
      note: 'Часть USD-резерва вернул на текущие расходы',
    },
  );

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
