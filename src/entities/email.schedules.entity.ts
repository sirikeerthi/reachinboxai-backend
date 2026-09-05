import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Relation,
} from "typeorm";
import { EmailRecipients } from "./email.recipients.entity.js";
import { User } from "./user.entity.js";

@Entity("email_schedules")
export class EmailSchedules {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "user_id", type: "int" })
  user_id!: number;

  @ManyToOne(() => User, (user) => user.schedules)
  @JoinColumn({ name: "user_id" })
  user!: Relation<User>;

  @Column({ type: "varchar", length: 255 })
  subject!: string;

  @Column({ type: "text" })
  body!: string;

  @Column({ name: "delay_ms", type: "int" })
  delayMs!: number;

  @Column({ name: "hourly_limit", type: "int" })
  hourlyLimit!: number;

  @Column({ name: "scheduled_at", type: "timestamptz" })
  scheduled_at!: Date;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updated_at!: Date;

  @OneToMany(() => EmailRecipients, (recipient) => recipient.schedule)
  recipients!: Relation<EmailRecipients>[];
}
