import { z } from 'zod';
import {
  AgentType,
  AssetScope,
  HoldingPeriod,
  PriceTier,
  RiskProfile,
  SignalFrequency,
  StrategyTag,
} from '@signals/domain';

/** 인코딩 깨진 입력(U+FFFD) 거부 — 금칙어 우회·데이터 오염 방지 (SEC-012). */
const cleanText = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .refine((s) => !s.includes('�'), '유효하지 않은 문자가 포함되어 있습니다');

/** AGT-005 필수 프로필. 가격(price_krw)은 서버가 티어에서 결정하므로 받지 않는다. */
export const CreateAgentSchema = z.object({
  name: cleanText(2, 30),
  tagline: cleanText(1, 60),
  description: cleanText(200, 3000),
  agentType: z.nativeEnum(AgentType), // 1차: MANUAL, RULE_BASED (AGT-004)
  riskProfile: z.nativeEnum(RiskProfile),
  assetScope: z.nativeEnum(AssetScope),
  strategyTags: z.array(z.nativeEnum(StrategyTag)).min(1).max(5),
  expectedFrequency: z.nativeEnum(SignalFrequency),
  avgHoldingPeriod: z.nativeEnum(HoldingPeriod),
  maxPositions: z.number().int().min(1).max(20),
  priceTier: z.nativeEnum(PriceTier),
});
export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;

export const UpdateAgentSchema = z
  .object({
    tagline: cleanText(1, 60).optional(),
    description: cleanText(200, 3000).optional(),
    thumbnailUrl: z.string().url().max(500).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, '수정할 필드가 없습니다');
export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>;

export const ReviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
});
export type ReviewInput = z.infer<typeof ReviewSchema>;
