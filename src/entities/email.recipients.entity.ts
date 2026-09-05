import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Relation,
} from "typeorm";
import { EmailSchedules } from "./email.schedules.entity.js";

export enum EmailScheduleStatus {
  SCHEDULED = "SCHEDULED",
  SENT = "SENT",
  FAILED = "FAILED",
}

@Entity("email_recipients")
export class EmailRecipients {
  @PrimaryGeneratedColumn({ name: "id" })
  id!: number;

  @Column({ name: "schedule_id", type: "int" })
  schedule_id!: number;

  @ManyToOne(() => EmailSchedules, (schedule) => schedule.recipients)
  @JoinColumn({ name: "schedule_id" })
  schedule!: Relation<EmailSchedules>;

  @Column({ name: "email", type: "varchar" })
  email!: string;

  @Column({
    name: "status",
    type: "enum",
    enum: EmailScheduleStatus,
    default: EmailScheduleStatus.SCHEDULED,
  })
  status!: EmailScheduleStatus;

  @Column({ name: "error_message", type: "text", nullable: true })
  error_message!: string | null;

  @Column({
    name: "sent_at",
    type: "timestamptz",
    nullable: true,
  })
  sent_at!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updated_at!: Date;
}
