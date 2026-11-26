"""Schéma initial

Revision ID: 0001
Revises: 
Create Date: 2026-11-26 02:09:50.704562
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0001'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.create_table('agent_runs',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('kind', sa.String(length=40), nullable=False),
    sa.Column('trigger', sa.String(length=40), nullable=False),
    sa.Column('status', sa.Enum('running', 'success', 'partial', 'failed', name='runstatus', native_enum=False, length=24), nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('stats', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('steps', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
    sa.Column('tokens_in', sa.Integer(), nullable=False),
    sa.Column('tokens_out', sa.Integer(), nullable=False),
    sa.Column('cost_usd', sa.Float(), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_agent_runs'))
    )
    op.create_index(op.f('ix_agent_runs_kind'), 'agent_runs', ['kind'], unique=False)
    op.create_index(op.f('ix_agent_runs_started_at'), 'agent_runs', ['started_at'], unique=False)
    op.create_table('donations',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('ref', sa.String(length=64), nullable=False),
    sa.Column('amount_xof', sa.BigInteger(), nullable=False),
    sa.Column('donor_name', sa.String(length=120), nullable=False),
    sa.Column('message', sa.String(length=280), nullable=False),
    sa.Column('is_public', sa.Boolean(), nullable=False),
    sa.Column('status', sa.Enum('pending', 'paid', 'cancelled', name='donationstatus', native_enum=False, length=24), nullable=False),
    sa.Column('payment_method', sa.String(length=60), nullable=False),
    sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_donations')),
    sa.UniqueConstraint('ref', name=op.f('uq_donations_ref'))
    )
    op.create_table('ledger_entries',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('month', sa.Date(), nullable=False),
    sa.Column('kind', sa.Enum('cost', 'donation', name='ledgerkind', native_enum=False, length=24), nullable=False),
    sa.Column('label', sa.String(length=200), nullable=False),
    sa.Column('amount_xof', sa.BigInteger(), nullable=False),
    sa.Column('public_name', sa.String(length=120), nullable=False),
    sa.Column('message', sa.String(length=280), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_ledger_entries'))
    )
    op.create_index(op.f('ix_ledger_entries_month'), 'ledger_entries', ['month'], unique=False)
    op.create_table('sources',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('slug', sa.String(length=80), nullable=False),
    sa.Column('name', sa.String(length=160), nullable=False),
    sa.Column('kind', sa.String(length=40), nullable=False),
    sa.Column('url', sa.String(length=500), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('config', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('enabled', sa.Boolean(), nullable=False),
    sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_status', sa.String(length=40), nullable=False),
    sa.Column('last_message', sa.Text(), nullable=False),
    sa.Column('last_found', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_sources')),
    sa.UniqueConstraint('slug', name=op.f('uq_sources_slug'))
    )
    op.create_table('users',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('full_name', sa.String(length=160), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=True),
    sa.Column('google_sub', sa.String(length=64), nullable=True),
    sa.Column('is_verified', sa.Boolean(), nullable=False),
    sa.Column('is_admin', sa.Boolean(), nullable=False),
    sa.Column('session_version', sa.Integer(), nullable=False),
    sa.Column('whatsapp_number', sa.String(length=32), nullable=True),
    sa.Column('alert_frequency', sa.Enum('daily', 'weekly', 'off', name='alertfrequency', native_enum=False, length=24), nullable=False),
    sa.Column('alert_min_score', sa.Integer(), nullable=False),
    sa.Column('alert_email', sa.Boolean(), nullable=False),
    sa.Column('alert_whatsapp', sa.Boolean(), nullable=False),
    sa.Column('reminders_enabled', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_digest_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_users')),
    sa.UniqueConstraint('google_sub', name=op.f('uq_users_google_sub'))
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_table('llm_calls',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('run_id', sa.UUID(), nullable=True),
    sa.Column('user_id', sa.UUID(), nullable=True),
    sa.Column('purpose', sa.String(length=40), nullable=False),
    sa.Column('provider', sa.String(length=20), nullable=False),
    sa.Column('model', sa.String(length=120), nullable=False),
    sa.Column('tokens_in', sa.Integer(), nullable=False),
    sa.Column('tokens_out', sa.Integer(), nullable=False),
    sa.Column('cost_usd', sa.Float(), nullable=False),
    sa.Column('duration_ms', sa.Integer(), nullable=False),
    sa.Column('ok', sa.Boolean(), nullable=False),
    sa.Column('error', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['run_id'], ['agent_runs.id'], name=op.f('fk_llm_calls_run_id_agent_runs'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_llm_calls_user_id_users'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_llm_calls'))
    )
    op.create_index(op.f('ix_llm_calls_created_at'), 'llm_calls', ['created_at'], unique=False)
    op.create_index(op.f('ix_llm_calls_user_id'), 'llm_calls', ['user_id'], unique=False)
    op.create_table('notification_logs',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('channel', sa.String(length=20), nullable=False),
    sa.Column('kind', sa.String(length=40), nullable=False),
    sa.Column('ref', sa.String(length=120), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_notification_logs_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_notification_logs')),
    sa.UniqueConstraint('user_id', 'kind', 'ref', name='uq_notification_logs_key')
    )
    op.create_index(op.f('ix_notification_logs_user_id'), 'notification_logs', ['user_id'], unique=False)
    op.create_table('opportunities',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('source_id', sa.UUID(), nullable=False),
    sa.Column('external_id', sa.String(length=200), nullable=False),
    sa.Column('content_hash', sa.String(length=64), nullable=False),
    sa.Column('url', sa.String(length=1000), nullable=False),
    sa.Column('title', sa.String(length=600), nullable=False),
    sa.Column('issuer', sa.String(length=300), nullable=False),
    sa.Column('country', sa.String(length=8), nullable=True),
    sa.Column('kind', sa.Enum('tender', 'consultancy', 'grant', 'competition', 'program', 'other', name='opportunitykind', native_enum=False, length=24), nullable=False),
    sa.Column('sectors', postgresql.ARRAY(sa.String(length=120)), server_default='{}', nullable=False),
    sa.Column('language', sa.String(length=8), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('summary', sa.Text(), nullable=False),
    sa.Column('budget_amount', sa.BigInteger(), nullable=True),
    sa.Column('budget_currency', sa.String(length=8), nullable=True),
    sa.Column('budget_xof', sa.BigInteger(), nullable=True),
    sa.Column('documents_required', postgresql.ARRAY(sa.String(length=200)), server_default='{}', nullable=False),
    sa.Column('eligibility', postgresql.ARRAY(sa.Text()), server_default='{}', nullable=False),
    sa.Column('keywords', postgresql.ARRAY(sa.String(length=120)), server_default='{}', nullable=False),
    sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('deadline_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('is_demo', sa.Boolean(), nullable=False),
    sa.Column('enriched_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('enrichment_method', sa.String(length=80), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('search_vector', postgresql.TSVECTOR(), sa.Computed("setweight(to_tsvector('french', coalesce(title, '')), 'A') || setweight(to_tsvector('french', coalesce(issuer, '') || ' ' || coalesce(summary, '')), 'B') || setweight(to_tsvector('french', coalesce(description, '')), 'C')", persisted=True), nullable=False),
    sa.ForeignKeyConstraint(['source_id'], ['sources.id'], name=op.f('fk_opportunities_source_id_sources'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_opportunities')),
    sa.UniqueConstraint('source_id', 'external_id', name='uq_opportunities_source_external')
    )
    op.create_index(op.f('ix_opportunities_budget_xof'), 'opportunities', ['budget_xof'], unique=False)
    op.create_index(op.f('ix_opportunities_content_hash'), 'opportunities', ['content_hash'], unique=False)
    op.create_index(op.f('ix_opportunities_country'), 'opportunities', ['country'], unique=False)
    op.create_index(op.f('ix_opportunities_deadline_at'), 'opportunities', ['deadline_at'], unique=False)
    op.create_index(op.f('ix_opportunities_published_at'), 'opportunities', ['published_at'], unique=False)
    op.create_index('ix_opportunities_search', 'opportunities', ['search_vector'], unique=False, postgresql_using='gin')
    op.create_index('ix_opportunities_sectors', 'opportunities', ['sectors'], unique=False, postgresql_using='gin')
    op.create_index(op.f('ix_opportunities_source_id'), 'opportunities', ['source_id'], unique=False)
    op.create_index('ix_opportunities_title_trgm', 'opportunities', ['title'], unique=False, postgresql_using='gin', postgresql_ops={'title': 'gin_trgm_ops'})
    op.create_table('profiles',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('organization_name', sa.String(length=200), nullable=False),
    sa.Column('org_type', sa.String(length=40), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('sectors', postgresql.ARRAY(sa.String(length=120)), server_default='{}', nullable=False),
    sa.Column('skills', postgresql.ARRAY(sa.String(length=120)), server_default='{}', nullable=False),
    sa.Column('countries', postgresql.ARRAY(sa.String(length=120)), server_default='{}', nullable=False),
    sa.Column('keywords_include', postgresql.ARRAY(sa.String(length=120)), server_default='{}', nullable=False),
    sa.Column('keywords_exclude', postgresql.ARRAY(sa.String(length=120)), server_default='{}', nullable=False),
    sa.Column('certifications', postgresql.ARRAY(sa.String(length=120)), server_default='{}', nullable=False),
    sa.Column('opportunity_kinds', postgresql.ARRAY(sa.String(length=120)), server_default='{}', nullable=False),
    sa.Column('budget_min', sa.BigInteger(), nullable=True),
    sa.Column('budget_max', sa.BigInteger(), nullable=True),
    sa.Column('team_size', sa.Integer(), nullable=True),
    sa.Column('past_references', sa.Text(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_profiles_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id', name=op.f('pk_profiles'))
    )
    op.create_table('vault_documents',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('doc_type', sa.String(length=40), nullable=False),
    sa.Column('label', sa.String(length=200), nullable=False),
    sa.Column('reference', sa.String(length=120), nullable=False),
    sa.Column('issued_on', sa.Date(), nullable=True),
    sa.Column('expires_on', sa.Date(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_vault_documents_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_vault_documents'))
    )
    op.create_index(op.f('ix_vault_documents_expires_on'), 'vault_documents', ['expires_on'], unique=False)
    op.create_index(op.f('ix_vault_documents_user_id'), 'vault_documents', ['user_id'], unique=False)
    op.create_table('matches',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('opportunity_id', sa.UUID(), nullable=False),
    sa.Column('score', sa.Integer(), nullable=False),
    sa.Column('rules_score', sa.Integer(), nullable=False),
    sa.Column('reasons', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
    sa.Column('criteria', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
    sa.Column('risks', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
    sa.Column('method', sa.String(length=40), nullable=False),
    sa.Column('status', sa.Enum('new', 'interested', 'preparing', 'submitted', 'ignored', 'won', 'lost', name='matchstatus', native_enum=False, length=24), nullable=False),
    sa.Column('feedback', sa.Enum('relevant', 'not_relevant', name='feedback', native_enum=False, length=24), nullable=True),
    sa.Column('notified_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('seen_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['opportunity_id'], ['opportunities.id'], name=op.f('fk_matches_opportunity_id_opportunities'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_matches_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_matches')),
    sa.UniqueConstraint('user_id', 'opportunity_id', name='uq_matches_user_opportunity')
    )
    op.create_index(op.f('ix_matches_opportunity_id'), 'matches', ['opportunity_id'], unique=False)
    op.create_index(op.f('ix_matches_status'), 'matches', ['status'], unique=False)
    op.create_index(op.f('ix_matches_user_id'), 'matches', ['user_id'], unique=False)
    op.create_index('ix_matches_user_score', 'matches', ['user_id', 'score'], unique=False)
    op.create_table('preparations',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('opportunity_id', sa.UUID(), nullable=False),
    sa.Column('requirements', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
    sa.Column('checklist', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
    sa.Column('outline', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
    sa.Column('letter', sa.Text(), nullable=False),
    sa.Column('notes', sa.Text(), nullable=False),
    sa.Column('source_document_name', sa.String(length=255), nullable=False),
    sa.Column('method', sa.String(length=80), nullable=False),
    sa.Column('validated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['opportunity_id'], ['opportunities.id'], name=op.f('fk_preparations_opportunity_id_opportunities'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_preparations_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_preparations')),
    sa.UniqueConstraint('user_id', 'opportunity_id', name='uq_preparations_user_opportunity')
    )
    op.create_index(op.f('ix_preparations_user_id'), 'preparations', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_preparations_user_id'), table_name='preparations')
    op.drop_table('preparations')
    op.drop_index('ix_matches_user_score', table_name='matches')
    op.drop_index(op.f('ix_matches_user_id'), table_name='matches')
    op.drop_index(op.f('ix_matches_status'), table_name='matches')
    op.drop_index(op.f('ix_matches_opportunity_id'), table_name='matches')
    op.drop_table('matches')
    op.drop_index(op.f('ix_vault_documents_user_id'), table_name='vault_documents')
    op.drop_index(op.f('ix_vault_documents_expires_on'), table_name='vault_documents')
    op.drop_table('vault_documents')
    op.drop_table('profiles')
    op.drop_index('ix_opportunities_title_trgm', table_name='opportunities', postgresql_using='gin', postgresql_ops={'title': 'gin_trgm_ops'})
    op.drop_index(op.f('ix_opportunities_source_id'), table_name='opportunities')
    op.drop_index('ix_opportunities_sectors', table_name='opportunities', postgresql_using='gin')
    op.drop_index('ix_opportunities_search', table_name='opportunities', postgresql_using='gin')
    op.drop_index(op.f('ix_opportunities_published_at'), table_name='opportunities')
    op.drop_index(op.f('ix_opportunities_deadline_at'), table_name='opportunities')
    op.drop_index(op.f('ix_opportunities_country'), table_name='opportunities')
    op.drop_index(op.f('ix_opportunities_content_hash'), table_name='opportunities')
    op.drop_index(op.f('ix_opportunities_budget_xof'), table_name='opportunities')
    op.drop_table('opportunities')
    op.drop_index(op.f('ix_notification_logs_user_id'), table_name='notification_logs')
    op.drop_table('notification_logs')
    op.drop_index(op.f('ix_llm_calls_user_id'), table_name='llm_calls')
    op.drop_index(op.f('ix_llm_calls_created_at'), table_name='llm_calls')
    op.drop_table('llm_calls')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
    op.drop_table('sources')
    op.drop_index(op.f('ix_ledger_entries_month'), table_name='ledger_entries')
    op.drop_table('ledger_entries')
    op.drop_table('donations')
    op.drop_index(op.f('ix_agent_runs_started_at'), table_name='agent_runs')
    op.drop_index(op.f('ix_agent_runs_kind'), table_name='agent_runs')
    op.drop_table('agent_runs')
