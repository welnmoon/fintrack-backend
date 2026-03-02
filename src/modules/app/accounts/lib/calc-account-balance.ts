type Tx = {
  type: 'INCOME' | 'EXPENSE' | 'ADJUSTMENT';
  amount: any;
  occurredAt: Date;
};
type TrOut = { fromAmount: any; occurredAt: Date };
type TrIn = { toAmount: any; occurredAt: Date };

export function calcAccountBalance(input: {
  initialBalance: any;
  transactions: Tx[];
  transfersOut: TrOut[];
  transfersIn: TrIn[];
}) {
  const lastAdj = input.transactions
    .filter((t) => t.type === 'ADJUSTMENT')
    .sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt))
    .at(0);

  const lastAdjMs = lastAdj ? +new Date(lastAdj.occurredAt) : null;
  const base = lastAdj ? Number(lastAdj.amount) : Number(input.initialBalance);

  const afterAdj = <T extends { occurredAt: Date }>(x: T) =>
    lastAdjMs === null ? true : +new Date(x.occurredAt) > lastAdjMs;

  const income = input.transactions
    .filter((t) => t.type === 'INCOME' && afterAdj(t))
    .reduce((s, t) => s + Number(t.amount), 0);

  const expense = input.transactions
    .filter((t) => t.type === 'EXPENSE' && afterAdj(t))
    .reduce((s, t) => s + Number(t.amount), 0);

  const out = input.transfersOut
    .filter(afterAdj)
    .reduce((s, t) => s + Number(t.fromAmount), 0);

  const inn = input.transfersIn
    .filter(afterAdj)
    .reduce((s, t) => s + Number(t.toAmount), 0);

  return base + income - expense + inn - out;
}
