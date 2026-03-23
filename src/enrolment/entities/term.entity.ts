import { Column, Entity, PrimaryColumn } from 'typeorm';
import { TermType } from '../models/term-type.enum';

@Entity('terms')
export class TermsEntity {
  @PrimaryColumn()
  num: number;

  @PrimaryColumn()
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
}
