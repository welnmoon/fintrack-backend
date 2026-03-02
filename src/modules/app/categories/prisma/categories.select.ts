import { Prisma } from '@prisma/client';

export const categorySelect = {
  id: true,
  name: true,
  type: true,
  colorKey: true,
  iconKey: true,
} satisfies Prisma.CategorySelect;

export type CategoryResponse = Prisma.CategoryGetPayload<{
  select: typeof categorySelect;
}>;
