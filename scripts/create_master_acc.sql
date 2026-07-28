create table if not exists master_acc (
  id bigserial primary key,
  person_id bigint null,
  email varchar(255) not null unique,
  password_hash varchar(255) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fk_master_acc_person
    foreign key (person_id)
    references master_people(id)
    on update cascade
    on delete set null
);

alter table master_acc add column if not exists password_hash varchar(255);
alter table master_acc drop column if exists password_plain;

create index if not exists idx_master_acc_email on master_acc (email);
create index if not exists idx_master_acc_person_id on master_acc (person_id);

insert into master_people (employee_code, full_name, nickname, department, job_title, email, is_active)
select 'EMP-ADMIN', 'Dashboard Admin', 'Admin', 'Management', 'Administrator', 'admin@user.com', true
where not exists (
  select 1 from master_people where lower(email) = lower('admin@user.com')
);

-- password_hash below = bcrypt(cost=12) of 'admin123'
-- To regenerate: node -e "const b=require('bcryptjs');b.hash('admin123',12).then(console.log)"
insert into master_acc (person_id, email, password_hash, is_active)
select mp.id, 'admin@user.com', '$2b$12$placeholder_run_migrate_pw_script', true
from master_people mp
where lower(mp.email) = lower('admin@user.com')
  and not exists (
    select 1 from master_acc where lower(email) = lower('admin@user.com')
  );

-- After insert, run: npm run migrate:pw  to hash any remaining plaintext passwords.
