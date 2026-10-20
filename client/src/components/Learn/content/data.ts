import type { Faq, Resource } from './schema';
import { FaqSchema, ResourceSchema } from './schema';
import resourcesJson from './resources.json';
import faqsJson from './faqs.json';

export const RESOURCES: Resource[] = resourcesJson.map((raw) => ResourceSchema.parse(raw));
export const FAQS: Faq[] = faqsJson.map((raw) => FaqSchema.parse(raw));
