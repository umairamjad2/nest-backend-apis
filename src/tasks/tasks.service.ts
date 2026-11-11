import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { TaskStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { QueryTasksDto } from './dto/query-tasks.dto.js';

// "YYYY-MM-DD" or a full ISO string -> Date; null clears the field
function toDate(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(value);
}

function isNotFound(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

/**
 * Every query is scoped to the logged-in user's ID, so a user can only ever see
 * or change their own tasks. Someone else's task gives 404, not 403, so the API
 * doesn't reveal which task IDs exist.
 */
@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  create(userId: number, dto: CreateTaskDto) {
    return this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description || null,
        status: dto.status,
        priority: dto.priority,
        dueDate: toDate(dto.dueDate),
        userId,
      },
    });
  }

  async findAll(userId: number, query: QueryTasksDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const order = query.order ?? 'desc';

    const where: Prisma.TaskWhereInput = {
      userId,
      status: query.status,
      priority: query.priority,
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    // Each sort ends on id so tasks with equal values keep a stable order across pages
    const orderBy: Prisma.TaskOrderByWithRelationInput[] =
      query.sortBy === 'dueDate'
        ? [{ dueDate: { sort: order, nulls: 'last' } }, { id: 'desc' }]
        : query.sortBy === 'priority'
          ? [{ priority: order }, { id: 'desc' }]
          : [{ createdAt: order }, { id: order }];

    const [items, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit }),
      this.prisma.task.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async stats(userId: number) {
    // Due before today (UTC) and not done
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const [byStatus, overdue] = await this.prisma.$transaction([
      this.prisma.task.groupBy({
        by: ['status'],
        where: { userId },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.task.count({
        where: { userId, status: { not: TaskStatus.DONE }, dueDate: { lt: startOfToday } },
      }),
    ]);

    const count = (status: TaskStatus) => {
      const row = byStatus.find((r) => r.status === status);
      return row?._count && typeof row._count === 'object' ? (row._count._all ?? 0) : 0;
    };

    const todo = count(TaskStatus.TODO);
    const inProgress = count(TaskStatus.IN_PROGRESS);
    const done = count(TaskStatus.DONE);

    return { total: todo + inProgress + done, todo, inProgress, done, overdue };
  }

  async findOne(userId: number, id: number) {
    const task = await this.prisma.task.findFirst({ where: { id, userId } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  async update(userId: number, id: number, dto: UpdateTaskDto) {
    try {
      return await this.prisma.task.update({
        // id is unique; userId makes the update fail for someone else's task
        where: { id, userId },
        data: {
          title: dto.title,
          description: dto.description === undefined ? undefined : dto.description || null,
          status: dto.status,
          priority: dto.priority,
          dueDate: toDate(dto.dueDate),
        },
      });
    } catch (error) {
      if (isNotFound(error)) throw new NotFoundException('Task not found');
      throw error;
    }
  }

  async remove(userId: number, id: number) {
    try {
      await this.prisma.task.delete({ where: { id, userId } });
      return { message: 'Task deleted' };
    } catch (error) {
      if (isNotFound(error)) throw new NotFoundException('Task not found');
      throw error;
    }
  }
}
