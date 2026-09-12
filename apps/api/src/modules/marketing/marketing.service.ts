import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IngestMarketingEventDto } from './dto/ingest-marketing-event.dto';
import { LeadService } from '../lead/lead.service';
import { LeadSource } from '@prisma/client';

@Injectable()
export class MarketingService {
  private readonly logger = new Logger(MarketingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leadService: LeadService,
  ) {}

  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  async ingestEvent(provider: string, dto: IngestMarketingEventDto): Promise<{ status: string; isDuplicate: boolean; leadId: string }> {
    const normalizedIncomingPhone = this.normalizePhone(dto.primaryPhone);

    return this.prisma.$transaction(async (tx) => {
      // 1. Obtain an advisory lock based on the normalized phone number to serialize concurrent webhooks for the same phone.
      // This guarantees no race condition can create two leads for the exact same phone concurrently.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${normalizedIncomingPhone}))`;

      // 2. External Idempotency Check
      const existingInteraction = await tx.marketingInteraction.findUnique({
        where: {
          provider_externalLeadId: {
            provider,
            externalLeadId: dto.externalLeadId,
          },
        },
      });

      if (existingInteraction) {
        this.logger.log(`Idempotent drop: Event ${dto.externalLeadId} from ${provider} already processed.`);
        
        await tx.auditEvent.create({
          data: {
            entityType: 'Lead',
            entityId: existingInteraction.leadId,
            action: 'MARKETING_IDEMPOTENT_DROP',
            actorUserId: 'SYSTEM',
            newValue: {
              provider,
              externalLeadId: dto.externalLeadId,
              message: 'Duplicate idempotent event received and dropped.',
            },
          },
        });

        return { status: 'IGNORED_IDEMPOTENT', isDuplicate: true, leadId: existingInteraction.leadId };
      }

      // 3. CRM Duplicate Detection (find existing lead by normalized phone)
      const duplicateQuery = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "leads"
        WHERE REGEXP_REPLACE(primary_phone, '[^0-9]', '', 'g') = ${normalizedIncomingPhone}
        ORDER BY created_at ASC
        LIMIT 1
      `;
      
      const duplicateLead = duplicateQuery.length > 0 ? duplicateQuery[0] : null;

      if (duplicateLead) {
        // MATCH FOUND: It's a duplicate.
        await tx.marketingInteraction.create({
          data: {
            leadId: duplicateLead.id,
            provider,
            externalLeadId: dto.externalLeadId,
            campaignId: dto.campaignId,
            campaignName: dto.campaignName,
            adsetId: dto.adsetId,
            adsetName: dto.adsetName,
            adId: dto.adId,
            adName: dto.adName,
            isOriginal: false,
          },
        });

        await tx.auditEvent.create({
          data: {
            entityType: 'Lead',
            entityId: duplicateLead.id,
            action: 'MARKETING_DUPLICATE_INGESTED',
            actorUserId: 'SYSTEM',
            newValue: {
              provider,
              externalLeadId: dto.externalLeadId,
              message: 'Duplicate event received and recorded.',
            },
          },
        });

        this.logger.log(`Duplicate found for phone ${normalizedIncomingPhone}. Interaction attached to Lead ${duplicateLead.id}.`);
        return { status: 'DUPLICATE_RECORDED', isDuplicate: true, leadId: duplicateLead.id };
      }

      // 4. NO MATCH: Create new Lead and trigger normal Round Robin logic.
      // We pass the transaction up. Since ingestion is system-level, hasReadAll = false, actorUserId = 'SYSTEM'.
      // But wait! Round Robin works best when hasReadAll = true (SALES_HEAD).
      // So actorUserId = 'SYSTEM', hasReadAll = true (triggers round robin).
      const newLeadResult = await this.leadService.create(
        {
          firstName: dto.firstName,
          lastName: dto.lastName,
          primaryPhone: dto.primaryPhone,
          externalLeadId: dto.externalLeadId,
          campaign: dto.campaignName,
          channel: provider,
          externalCampaignId: dto.campaignId,
          source: provider.includes('META') || provider.includes('FACEBOOK') ? LeadSource.META_FACEBOOK : LeadSource.OTHER,
        },
        'SYSTEM',
        true,
        tx
      );

      const newLead = newLeadResult.lead;

      // Create the interaction as the original
      await tx.marketingInteraction.create({
        data: {
          leadId: newLead.id,
          provider,
          externalLeadId: dto.externalLeadId,
          campaignId: dto.campaignId,
          campaignName: dto.campaignName,
          adsetId: dto.adsetId,
          adsetName: dto.adsetName,
          adId: dto.adId,
          adName: dto.adName,
          isOriginal: true,
        },
      });

      this.logger.log(`New lead created via ingestion. Lead ID: ${newLead.id}, Phone: ${normalizedIncomingPhone}`);
      return { status: 'CREATED', isDuplicate: false, leadId: newLead.id };
    });
  }
}
