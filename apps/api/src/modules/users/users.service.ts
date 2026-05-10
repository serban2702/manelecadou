import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  /** Caută user după id global. Id-ul e UUID unic, nu trebuie scoped pe site. */
  findById(id: string) {
    return this.users.findOne({ where: { id } });
  }

  /** Caută user după email scoped pe site (același email pe RO și BG = useri diferiți). */
  findByEmail(email: string, siteId: string | null) {
    const normalized = email.toLowerCase();
    return this.users.findOne({
      where: siteId ? { email: normalized, siteId } : { email: normalized },
    });
  }

  async findOrCreateByEmail(email: string, siteId: string | null): Promise<User> {
    const normalized = email.toLowerCase().trim();
    const existing = await this.findByEmail(normalized, siteId);
    if (existing) return existing;
    const created = this.users.create({ email: normalized, siteId });
    return this.users.save(created);
  }

  async setLocale(id: string, locale: string): Promise<void> {
    await this.users.update({ id }, { locale });
  }
}
