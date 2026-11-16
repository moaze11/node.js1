// Mock Prisma partagé : aucun test ne touche une vraie base (pas de risque d'effacer dev.db, CI sans DB).
const model = () => ({
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  upsert: jest.fn(),
  delete: jest.fn(),
  deleteMany: jest.fn(),
});

export const prismaMock: any = {
  user: model(),
  role: model(),
  ticket: model(),
  auditLog: model(),
  refreshToken: model(),
  invitation: model(),
  passwordReset: model(),
  $transaction: jest.fn(),
  $disconnect: jest.fn(),
};

/** À appeler dans beforeEach : remet les mocks à zéro et réinstalle $transaction. */
export function resetPrismaMock() {
  for (const key of Object.keys(prismaMock)) {
    const value = prismaMock[key];
    if (typeof value === 'function') value.mockReset();
    else for (const fn of Object.values(value)) (fn as jest.Mock).mockReset();
  }
  prismaMock.$transaction.mockImplementation((arg: any) =>
    typeof arg === 'function' ? arg(prismaMock) : Promise.all(arg)
  );
  prismaMock.auditLog.create.mockResolvedValue({});
}
