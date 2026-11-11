import { NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { TasksService } from './tasks.service.js';

function createPrismaMock() {
  return {
    task: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      delete: vi.fn(),
    },
    // The real $transaction runs an array of queries; resolving them in order is enough here
    $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
  };
}

const notFoundError = () =>
  new Prisma.PrismaClientKnownRequestError('Record not found', {
    code: 'P2025',
    clientVersion: 'test',
  });

describe('TasksService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: TasksService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new TasksService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('saves the task for the given user and converts the due date', async () => {
      await service.create(7, { title: 'Write tests', description: '', dueDate: '2026-12-01' });

      expect(prisma.task.create).toHaveBeenCalledWith({
        data: {
          title: 'Write tests',
          description: null,
          status: undefined,
          priority: undefined,
          dueDate: new Date('2026-12-01'),
          userId: 7,
        },
      });
    });
  });

  describe('findAll', () => {
    it('only searches the given user tasks and paginates', async () => {
      prisma.task.count.mockResolvedValue(23);

      const result = await service.findAll(7, { page: 3, limit: 10, status: 'TODO', search: 'docs' });

      const args = prisma.task.findMany.mock.calls[0][0];
      expect(args.where).toMatchObject({ userId: 7, status: 'TODO' });
      expect(args.where.OR).toHaveLength(2);
      expect(args.skip).toBe(20);
      expect(args.take).toBe(10);
      expect(result).toMatchObject({ total: 23, page: 3, limit: 10, totalPages: 3 });
    });

    it('defaults to newest first, 10 per page', async () => {
      const result = await service.findAll(7, {});

      const args = prisma.task.findMany.mock.calls[0][0];
      expect(args.orderBy[0]).toEqual({ createdAt: 'desc' });
      expect(args.where.OR).toBeUndefined();
      expect(result).toMatchObject({ page: 1, limit: 10, totalPages: 1 });
    });

    it('puts tasks without a due date last when sorting by due date', async () => {
      await service.findAll(7, { sortBy: 'dueDate', order: 'asc' });

      const args = prisma.task.findMany.mock.calls[0][0];
      expect(args.orderBy[0]).toEqual({ dueDate: { sort: 'asc', nulls: 'last' } });
    });
  });

  describe('findOne', () => {
    it("throws 404 for a task that doesn't belong to the user", async () => {
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(service.findOne(7, 99)).rejects.toThrow(NotFoundException);
      expect(prisma.task.findFirst).toHaveBeenCalledWith({ where: { id: 99, userId: 7 } });
    });
  });

  describe('update', () => {
    it('scopes the update to the user and only sends fields that were given', async () => {
      await service.update(7, 5, { status: 'DONE', dueDate: null });

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 5, userId: 7 },
        data: {
          title: undefined,
          description: undefined,
          status: 'DONE',
          priority: undefined,
          dueDate: null,
        },
      });
    });

    it("turns Prisma's not-found error into a 404", async () => {
      prisma.task.update.mockRejectedValue(notFoundError());

      await expect(service.update(7, 5, { title: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it("turns Prisma's not-found error into a 404", async () => {
      prisma.task.delete.mockRejectedValue(notFoundError());

      await expect(service.remove(7, 5)).rejects.toThrow(NotFoundException);
      expect(prisma.task.delete).toHaveBeenCalledWith({ where: { id: 5, userId: 7 } });
    });
  });

  describe('stats', () => {
    it('counts tasks per status, with zero for missing ones', async () => {
      prisma.task.groupBy.mockResolvedValue([
        { status: 'TODO', _count: { _all: 3 } },
        { status: 'DONE', _count: { _all: 2 } },
      ]);
      prisma.task.count.mockResolvedValue(1);

      await expect(service.stats(7)).resolves.toEqual({
        total: 5,
        todo: 3,
        inProgress: 0,
        done: 2,
        overdue: 1,
      });
    });
  });
});
