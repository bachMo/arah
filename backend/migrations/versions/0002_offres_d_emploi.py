"""Offres d'emploi : contrats, profils candidats et offres proposées par les recruteurs

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-27 15:30:03.591529
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0002'
down_revision: str | None = '0001'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('job_submissions',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=True),
    sa.Column('status', sa.Enum('pending', 'approved', 'rejected', name='submissionstatus', native_enum=False, length=24), nullable=False),
    sa.Column('title', sa.String(length=300), nullable=False),
    sa.Column('company', sa.String(length=200), nullable=False),
    sa.Column('contract_type', sa.String(length=20), nullable=False),
    sa.Column('experience_level', sa.String(length=20), nullable=True),
    sa.Column('country', sa.String(length=8), nullable=False),
    sa.Column('location', sa.String(length=160), nullable=False),
    sa.Column('remote', sa.Boolean(), nullable=False),
    sa.Column('sectors', postgresql.ARRAY(sa.String(length=120)), server_default='{}', nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('apply_url', sa.String(length=1000), nullable=False),
    sa.Column('apply_email', sa.String(length=255), nullable=False),
    sa.Column('deadline_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('review_note', sa.Text(), nullable=False),
    sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('opportunity_id', sa.UUID(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['opportunity_id'], ['opportunities.id'], name=op.f('fk_job_submissions_opportunity_id_opportunities'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_job_submissions_user_id_users'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_job_submissions'))
    )
    op.create_index(op.f('ix_job_submissions_status'), 'job_submissions', ['status'], unique=False)
    op.create_index(op.f('ix_job_submissions_user_id'), 'job_submissions', ['user_id'], unique=False)
    op.add_column('opportunities', sa.Column('contract_type', sa.String(length=20), nullable=True))
    op.add_column('opportunities', sa.Column('experience_level', sa.String(length=20), nullable=True))
    op.add_column('opportunities', sa.Column('location', sa.String(length=160), server_default='', nullable=False))
    op.add_column('opportunities', sa.Column('remote', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('opportunities', sa.Column('apply_info', sa.Text(), server_default='', nullable=False))
    op.create_index(op.f('ix_opportunities_contract_type'), 'opportunities', ['contract_type'], unique=False)
    op.add_column('profiles', sa.Column('profile_kind', sa.String(length=20), server_default='organization', nullable=False))
    op.add_column('profiles', sa.Column('job_title', sa.String(length=160), server_default='', nullable=False))
    op.add_column('profiles', sa.Column('contract_types', postgresql.ARRAY(sa.String(length=120)), server_default='{}', nullable=False))
    op.add_column('profiles', sa.Column('experience_level', sa.String(length=20), nullable=True))
    op.add_column('profiles', sa.Column('remote_ok', sa.Boolean(), server_default='false', nullable=False))


def downgrade() -> None:
    op.drop_column('profiles', 'remote_ok')
    op.drop_column('profiles', 'experience_level')
    op.drop_column('profiles', 'contract_types')
    op.drop_column('profiles', 'job_title')
    op.drop_column('profiles', 'profile_kind')
    op.drop_index(op.f('ix_opportunities_contract_type'), table_name='opportunities')
    op.drop_column('opportunities', 'apply_info')
    op.drop_column('opportunities', 'remote')
    op.drop_column('opportunities', 'location')
    op.drop_column('opportunities', 'experience_level')
    op.drop_column('opportunities', 'contract_type')
    op.drop_index(op.f('ix_job_submissions_user_id'), table_name='job_submissions')
    op.drop_index(op.f('ix_job_submissions_status'), table_name='job_submissions')
    op.drop_table('job_submissions')
