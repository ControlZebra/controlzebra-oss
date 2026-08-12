# features/conflict

Conflict detection and resolution feature module.

## Ownership
- Conflict resolution data contracts and backend model mapping
- Conflict decision queues and resolver UI
- Text conflict composition and validation

Merge workflow orchestration remains in `features/merge` and consumes this
feature through its public exports.