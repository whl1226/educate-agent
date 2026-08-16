import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../../db/entities/system.entities';
import { JwtUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notes: Repository<Notification>,
  ) {}

  async list(user: JwtUser) {
    const rows = await this.notes.find({ where: { userId: user.id }, order: { id: 'DESC' }, take: 50 });
    return rows.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      type: n.type,
      link: n.link,
      isRead: !!n.isRead,
      createdAt: n.createdAt,
    }));
  }

  async unreadCount(user: JwtUser) {
    return this.notes.count({ where: { userId: user.id, isRead: 0 } });
  }

  async markRead(user: JwtUser, id: number) {
    await this.notes.update({ id, userId: user.id }, { isRead: 1 });
    return { ok: true };
  }

  async markAllRead(user: JwtUser) {
    await this.notes.update({ userId: user.id }, { isRead: 1 });
    return { ok: true };
  }

  async push(userId: number, title: string, content: string, type = 'system', link: string | null = null) {
    await this.notes.save(
      this.notes.create({ userId, title: title.slice(0, 128), content: content.slice(0, 500), type, link }),
    );
  }
}