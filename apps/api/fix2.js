const fs = require('fs');
let c = fs.readFileSync('src/modules/lead/lead.service.ts', 'utf8');
const marker = '...(query.cursor ? { cursor: { id: decodeCursor(query.cursor) }, skip: 1 } : {}),';
const endMarker = '\n        entityType: \'Lead\',\n        entityId: id,\n        action: \'UPDATE\',';

const p1 = c.split(marker)[0];
const p2 = c.split(endMarker)[1];

const newText = p1 + marker + `
      orderBy: { createdAt: 'asc' }, // Oldest uncontacted first logic foundation
      include: {
        students: { select: { id: true, firstName: true, lastName: true, currentGrade: true } },
      }
    });

    const hasNextPage = items.length > limit;
    const data = hasNextPage ? items.slice(0, limit) : items;
    const nextCursor = hasNextPage && data.length > 0 ? encodeCursor(data[data.length - 1].id) : null;

    return { data, pagination: { nextCursor, hasNextPage, limit } };
  }

  async findOne(id: string, userId: string, hasReadAll: boolean) {
    await this.checkOwnership(id, userId, hasReadAll);
    return this.prisma.lead.findUnique({
      where: { id },
      include: {
        students: { include: { requirements: { include: { subject: true, grade: true, curriculum: true } } } },
        statusHistory: { orderBy: { changedAt: 'desc' } },
        assignmentHistory: { orderBy: { assignedAt: 'desc' } },
        salesNotes: { orderBy: { createdAt: 'desc' }, include: { createdByUser: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } } } },
        marketingAttribution: true,
      },
    });
  }

  async update(id: string, dto: UpdateLeadDto, userId: string, hasReadAll: boolean) {
    await this.checkOwnership(id, userId, hasReadAll);

    const oldLead = await this.prisma.lead.findUnique({ where: { id } });

    const newLead = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: dto,
      });

      await this.audit.recordInTx(tx, {\n        entityType: \'Lead\',\n        entityId: id,\n        action: \'UPDATE\',` +
        p2;

fs.writeFileSync('src/modules/lead/lead.service.ts', newText);
