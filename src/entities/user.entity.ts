import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Relation,
} from "typeorm";
import { EmailSchedules } from "./email.schedules.entity.js";
import { SlackConnections } from "./slack.connections.entity.js";

@Entity()
export class User {
  @PrimaryGeneratedColumn({ name: "id" })
  id!: number;

  @Column({ name: "googleId", type: "varchar" })
  googleId!: string;

  @Column({ name: "email", type: "varchar" })
  email!: string;

  @Column({ name: "name", type: "varchar" })
  name!: string;

  @Column({ name: "avator_url", type: "varchar" })
  avatorUrl!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  created_at!: Date;

  @OneToMany(() => EmailSchedules, (schedule) => schedule.user)
  schedules!: Relation<EmailSchedules>[];

  @OneToMany(() => SlackConnections, (connection) => connection.user)
  slackConnections!: Relation<SlackConnections>[];
}
