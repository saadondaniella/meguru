import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';
import { Profile } from '../../services/profile';
import { EditorialFeature } from '../../components/editorial-feature/editorial-feature';

interface GuideItem {
  id: string;
  title: string;
  intro: string;
  tips: { term?: string; text: string }[];
  note?: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, EditorialFeature],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  private auth = inject(Auth);
  private profileService = inject(Profile);
  private copyTimeout?: ReturnType<typeof setTimeout>;

  displayName = signal('');
  storefrontUrl = signal('');
  isLoading = signal(true);
  errorMessage = signal('');
  isCopied = signal(false);

  readonly guideItems: GuideItem[] = [
    {
      id: 'photos',
      title: 'Good Photos',
      intro: 'Clear, honest images are the first thing a buyer notices.',
      tips: [
        { text: 'Use natural daylight and a clean background.' },
        { text: 'Show the entire garment and photograph it from different angles.' },
        { text: 'Include close-ups of labels, details and imperfections.' },
        { text: 'Present the item cleanly and honestly.' },
        {
          term: 'Image too large?',
          text: 'If your photo exceeds the upload limit, try exporting it at a smaller file size or taking a screenshot and uploading that instead. Keep in mind that screenshots may reduce image quality.',
        },
      ],
    },
    {
      id: 'details',
      title: 'Details Matter',
      intro: 'The more a buyer knows, the more confident they feel.',
      tips: [
        { text: 'Include material and fabric composition.' },
        { text: 'Add measurements, fit and care instructions.' },
        { text: 'Mention the original retail price when known.' },
        { text: 'Describe imperfections and signs of wear honestly.' },
      ],
    },
    {
      id: 'price',
      title: 'Price With Purpose',
      intro: 'A fair price helps your piece find its next owner faster.',
      tips: [
        { text: "Consider the item's condition, brand and original value." },
        { text: 'Compare similar secondhand pieces.' },
        { text: 'Set a fair, realistic price.' },
      ],
    },
    {
      id: 'collection',
      title: 'Choose Your Collection',
      intro: 'Place your piece where the right buyers will look for it.',
      tips: [
        {
          term: 'Budget',
          text: 'Affordable secondhand finds, recommended at 500 SEK or below.',
        },
        {
          term: 'Exclusive',
          text: 'Unique, designer, vintage or special pieces, regardless of price.',
        },
        { term: 'Pass It On', text: 'Give your item a new home for free.' },
      ],
      note: 'These are recommendations, not strict price restrictions.',
    },
  ];

  readonly openGuideIds = signal<ReadonlySet<string>>(new Set());

  toggleGuideItem(id: string) {
    this.openGuideIds.update((open) => {
      const next = new Set(open);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  async ngOnInit() {
    try {
      const {
        data: { session },
        error,
      } = await this.auth.getSession();

      if (error) {
        throw error;
      }

      if (!session) {
        this.errorMessage.set('Unable to load your account.');
        return;
      }

      const userId = session.user.id;

      // Build the public storefront URL
      this.storefrontUrl.set(`${window.location.origin}/sellers/${userId}`);

      // Get the user's profile
      const { data: profile, error: profileError } = await this.profileService.getProfile(userId);

      if (profileError) {
        throw profileError;
      }

      this.displayName.set(profile?.display_name ?? '');
    } catch {
      this.errorMessage.set('Something went wrong while loading your dashboard.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async copyStorefrontUrl() {
    try {
      await navigator.clipboard.writeText(this.storefrontUrl());

      clearTimeout(this.copyTimeout);

      this.isCopied.set(true);

      this.copyTimeout = setTimeout(() => {
        this.isCopied.set(false);
      }, 3500);
    } catch {
      this.errorMessage.set('Unable to copy the link.');
    }
  }
}
