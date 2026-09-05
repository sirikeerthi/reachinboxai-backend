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
import { User } from "./user.entity.js";

@Entity("slack_connections")
export class SlackConnections {
  @PrimaryGeneratedColumn({ name: "id" })
  id!: number;

  @Column({ name: "user_id", type: "int" })
  user_id!: number;

  @ManyToOne(() => User, (user) => user.slackConnections)
  @JoinColumn({ name: "user_id" })
  user!: Relation<User>;

  @Column({ name: "access_token", type: "varchar" })
  access_token!: string;

  @Column({ name: "team_id", type: "varchar" })
  team_id!: string;

  @Column({ name: "slack_user_id", type: "varchar" })
  slack_user_id!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updated_at!: Date;
}
