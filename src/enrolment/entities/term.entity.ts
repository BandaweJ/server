import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { TermType } from '../models/term-type.enum';
import { EnrolEntity } from './enrol.entity';

@Entity('terms')
export class TermsEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  num: number;

  @Column()
  year: number;

  @Column()
  startDate: Date;

  @Column()
  endDate: Date;

  @Column({
    type: 'varchar',
    length: 20,
    default: TermType.REGULAR,
  })
  type: TermType;

  @Column({ type: 'varchar', length: 120, nullable: true })
  label?: string | null;

  @OneToMany(() => EnrolEntity, (enrol) => enrol.term)
  enrolments: EnrolEntity[];
}
