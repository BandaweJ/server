import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { TextbookCopyEntity } from './textbook-copy.entity';

@Entity('textbook_titles')
export class TextbookTitleEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Index()
  @Column()
  title: string;

  @Index()
  @Column({ nullable: true })
  author?: string | null;

  @Column({ nullable: true })
  edition?: string | null;

  @Index()
  @Column({ nullable: true })
  isbn?: string | null;

  @Column({ nullable: true })
  publisher?: string | null;

  @Column({ nullable: true })
  subject?: string | null;

  @Column({ nullable: true })
  notes?: string | null;

  @OneToMany(() => TextbookCopyEntity, (copy) => copy.title)
  copies: TextbookCopyEntity[];
}

