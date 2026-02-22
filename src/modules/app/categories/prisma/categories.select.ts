import { Prisma } from '@prisma/client';

export const categorySelect = {
  id: true,
  name: true,
  type: true,
  color: true,
  icon: true,
} satisfies Prisma.CategorySelect;

export type CategoryResponse = Prisma.CategoryGetPayload<{
  select: typeof categorySelect;
}>;
