const categories = ['Career', 'Finance', 'Wellness', 'Technology'];

const expertSeeds = [
  {
    id: 'expert-maya',
    name: 'Maya Chen',
    title: 'Career & Leadership Coach',
    category: 'Career',
    bio: 'Former product leader helping thoughtful teams and founders make their next move with confidence.',
    location: 'San Francisco, CA',
    rating: 4.9,
    reviewCount: 128,
    yearsExperience: 12,
    priceCents: 9500,
    accent: '#E4F2EC',
    initials: 'MC'
  },
  {
    id: 'expert-omar',
    name: 'Omar Rahman',
    title: 'Personal Finance Advisor',
    category: 'Finance',
    bio: 'A fiduciary advisor who turns complex money decisions into a clear, kind action plan.',
    location: 'New York, NY',
    rating: 4.8,
    reviewCount: 96,
    yearsExperience: 9,
    priceCents: 12000,
    accent: '#F9EBD8',
    initials: 'OR'
  },
  {
    id: 'expert-priya',
    name: 'Priya Nair',
    title: 'Mindfulness & Wellbeing Guide',
    category: 'Wellness',
    bio: 'Trauma-informed practitioner offering practical tools for calmer, more focused workdays.',
    location: 'Austin, TX',
    rating: 5,
    reviewCount: 74,
    yearsExperience: 8,
    priceCents: 7000,
    accent: '#E8E4F4',
    initials: 'PN'
  },
  {
    id: 'expert-julian',
    name: 'Julian Alvarez',
    title: 'Product & Technology Mentor',
    category: 'Technology',
    bio: 'Engineering manager and mentor for people building useful products in ambiguous environments.',
    location: 'Seattle, WA',
    rating: 4.9,
    reviewCount: 111,
    yearsExperience: 15,
    priceCents: 11000,
    accent: '#DDEBF5',
    initials: 'JA'
  }
];

function nextWeekdayUtc(dayOffset, hour, minute = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

function soonUtc() {
  const date = new Date(Date.now() + 2 * 60 * 60 * 1000);
  date.setUTCMinutes(date.getUTCMinutes() < 30 ? 30 : 0, 0, 0);
  if (date.getUTCMinutes() === 0) date.setUTCHours(date.getUTCHours() + 1);
  return date.toISOString();
}

function seedSlots() {
  const slots = [];
  let index = 0;
  expertSeeds.forEach((expert, expertIndex) => {
    [0, 1, 2, 3].forEach((dayOffset, dayIndex) => {
      const hour = 15 + ((expertIndex + dayIndex) % 4);
      const startsAt = dayOffset === 0 ? soonUtc() : nextWeekdayUtc(dayOffset, hour);
      const end = new Date(startsAt);
      end.setUTCHours(end.getUTCHours() + 1);
      slots.push({
        id: `${expert.id}-slot-${index += 1}`,
        expertId: expert.id,
        startsAt,
        endsAt: end.toISOString(),
        priceCents: expert.priceCents
      });
    });
  });
  return slots;
}

export function createStore() {
  const experts = expertSeeds.map((expert) => ({ ...expert }));
  const slots = seedSlots();
  const bookings = new Map();
  const idempotency = new Map();

  return {
    categories,
    experts,
    slots,
    bookings,
    idempotency
  };
}

export function publicExpert(expert, availableSlots) {
  return {
    ...expert,
    priceCents: Number(expert.priceCents),
    nextAvailableAt: availableSlots
      .map((slot) => slot.startsAt)
      .sort()[0] ?? null
  };
}
