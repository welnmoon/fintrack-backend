export type TransferResponse = {
  id: string;
  userId: string;
  fromAccountId: string;
  toAccountId: string;

  fromAmount: string;
  toAmount: string;
  exchangeRate: string;

  occurredAt: string; // ISO
  note: string | null;
  createdAt: string; // ISO
  isCanceled: boolean;
};
