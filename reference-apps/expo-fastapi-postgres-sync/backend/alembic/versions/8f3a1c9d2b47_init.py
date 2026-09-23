"""init

Revision ID: 8f3a1c9d2b47
Revises:
Create Date: 2026-09-23 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '8f3a1c9d2b47'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('users',
    sa.Column('id', sa.String(length=32), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=False),
    sa.Column('role', sa.String(length=16), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('email')
    )
    op.create_table('tasks',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('title', sa.String(length=255), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('owner_id', sa.String(length=32), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_tasks_owner_id', 'tasks', ['owner_id'], unique=False)
    op.create_index('ix_tasks_updated_at', 'tasks', ['updated_at'], unique=False)
    op.create_table('audit_logs',
    sa.Column('id', sa.String(length=32), nullable=False),
    sa.Column('task_id', sa.String(length=36), nullable=False),
    sa.Column('user_id', sa.String(length=32), nullable=False),
    sa.Column('action', sa.String(length=16), nullable=False),
    sa.Column('via', sa.String(length=8), nullable=False),
    sa.Column('before', sa.JSON(), nullable=True),
    sa.Column('after', sa.JSON(), nullable=True),
    sa.Column('at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_audit_logs_task_id', 'audit_logs', ['task_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_audit_logs_task_id', table_name='audit_logs')
    op.drop_table('audit_logs')
    op.drop_index('ix_tasks_updated_at', table_name='tasks')
    op.drop_index('ix_tasks_owner_id', table_name='tasks')
    op.drop_table('tasks')
    op.drop_table('users')
