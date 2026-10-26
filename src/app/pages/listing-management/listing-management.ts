import {
  Component,
  inject,
  OnInit,
  signal,
  computed,
  viewChild,
  HostListener,
  ElementRef,
  effect,
  afterNextRender,
  Injector,
} from '@angular/core';
import { ListingService } from '../../services/listing';
import { SUPABASE_CLIENT } from '../../services/supabase';
import { Listing } from '../../models/listing';
import { ListingForm, ListingSavedType } from './listing-form/listing-form';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-listing-management',
  imports: [RouterLink, ListingForm],
  templateUrl: './listing-management.html',
  styleUrl: './listing-management.css',
})
export class ListingManagement implements OnInit {
  private supabase = inject(SUPABASE_CLIENT);

  listingService = inject(ListingService);

  listings = signal<Listing[]>([]);

  publishedListings = computed(() =>
    this.listings().filter((listing) => listing.status === 'published'),
  );

  draftListings = computed(() => this.listings().filter((listing) => listing.status === 'draft'));

  soldListings = computed(() => this.listings().filter((listing) => listing.status === 'sold'));

  isUploading = signal(false);
  editingListing = signal<Listing | null>(null);
  isModalOpen = signal(false);
  pageSuccessMessage = signal('');
  successPopup = signal<ListingSavedType | null>(null);
  isMarkingSold = signal(false);
  soldErrorMessage = signal('');
  currentSellerId = signal<string | null>(null);
  readonly statusChangeTarget = signal<Listing | null>(null);
  readonly statusChangeTo = signal<'sold' | 'published' | null>(null);
  readonly statusDialog = viewChild<ElementRef<HTMLDivElement>>('statusDialog');

  // DELETE CONFIRMATION
  deleteTarget = signal<Listing | null>(null);
  deleteErrorMessage = signal('');
  isDeleting = signal(false);
  deleteDialog = viewChild<ElementRef<HTMLDivElement>>('deleteDialog');

  successCloseButton = viewChild<ElementRef<HTMLButtonElement>>('successCloseButton');
  private readonly injector = inject(Injector);
  private statusTriggerElement: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const button = this.successCloseButton();

      if (button) {
        button.nativeElement.focus();
      }
    });
  }

  private deleteTrigger: HTMLButtonElement | null = null;

  newListingButton = viewChild<ElementRef<HTMLButtonElement>>('newListingButton');
  // Element that opened the form; focus returns here after the success popup if it still exists.
  private formTrigger: HTMLElement | null = null;

  showSuccessPopup(type: ListingSavedType) {
    this.successPopup.set(type);
  }

  closeSuccessPopup() {
    this.successPopup.set(null);
    this.pageSuccessMessage.set('');

    // The form modal is gone by now, so restore focus to the element that opened it,
    // or to the "New listing" button when that element no longer exists
    // (e.g. a draft that moved to the published list).
    const trigger = this.formTrigger?.isConnected ? this.formTrigger : null;
    this.formTrigger = null;

    (trigger ?? this.newListingButton()?.nativeElement)?.focus();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    if (this.statusChangeTarget() && !this.isMarkingSold()) {
      this.closeStatusConfirmation();
    }
  }

  // OPEN MODAL FOR A NEW LISTING
  onCreateListing(event?: Event) {
    if (this.isUploading()) return;
    this.pageSuccessMessage.set('');

    this.formTrigger = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.editingListing.set(null);
    this.isModalOpen.set(true);
  }

  // CLOSE MODAL
  onCloseModal() {
    if (this.isUploading()) return;

    this.isModalOpen.set(false);
    this.editingListing.set(null);
    this.restoreFormTriggerFocus();
  }

  openStatusConfirmation(listing: Listing, status: 'sold' | 'published', trigger: HTMLElement) {
    this.statusTriggerElement = trigger;
    this.soldErrorMessage.set('');
    this.statusChangeTarget.set(listing);
    this.statusChangeTo.set(status);

    afterNextRender(
      () => {
        this.statusDialog()?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  closeStatusConfirmation() {
    if (this.isMarkingSold()) return;

    this.statusChangeTarget.set(null);
    this.statusChangeTo.set(null);

    const trigger = this.statusTriggerElement;
    this.statusTriggerElement = null;

    afterNextRender(
      () => {
        // After a successful status change, the original button moves
        // to another section and may no longer exist in the DOM.
        const focusTarget = trigger?.isConnected ? trigger : this.newListingButton()?.nativeElement;
        focusTarget?.focus();
      },
      { injector: this.injector },
    );
  }

  // START EDITING
  onEditListing(listing: Listing, event?: Event) {
    if (this.isUploading()) return;
    this.pageSuccessMessage.set('');

    this.formTrigger = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.editingListing.set(listing);
    this.isModalOpen.set(true);
  }

  // FORM SAVED — close the modal, refresh the list and confirm with the popup
  async onListingSaved(type: ListingSavedType) {
    const wasEditing = this.editingListing() !== null;

    this.pageSuccessMessage.set(
      type === 'published'
        ? 'Your listing has been published!'
        : type === 'updated'
          ? 'Your changes have been saved!'
          : wasEditing
            ? 'Your draft has been updated!'
            : 'Your draft has been saved!',
    );

    this.editingListing.set(null);
    this.isModalOpen.set(false);
    this.showSuccessPopup(type);

    await this.loadListings();
  }

  private restoreFormTriggerFocus() {
    const trigger = this.formTrigger?.isConnected
      ? this.formTrigger
      : this.newListingButton()?.nativeElement;
    this.formTrigger = null;
    queueMicrotask(() => trigger?.focus());
  }

  // OPEN DELETE CONFIRMATION — no database changes yet
  onDeleteListing(listingId: string, event?: Event) {
    if (this.isUploading() || this.isDeleting()) return;

    const listing = this.listings().find((item) => item.id === listingId);
    if (!listing) return;

    this.deleteTrigger =
      event?.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null;
    this.deleteErrorMessage.set('');
    this.deleteTarget.set(listing);

    // Wait for Angular to render the dialog before moving keyboard focus.
    setTimeout(() => {
      this.deleteDialog()
        ?.nativeElement.querySelector<HTMLButtonElement>('[data-delete-cancel]')
        ?.focus();
    }, 0);
  }

  // CLOSE DELETE CONFIRMATION
  onCancelDelete() {
    if (this.isDeleting()) return;
    this.deleteTarget.set(null);
    this.deleteErrorMessage.set('');

    const trigger = this.deleteTrigger;
    this.deleteTrigger = null;
    queueMicrotask(() => trigger?.isConnected && trigger.focus());
  }

  // ESC closes; TAB stays inside the confirmation dialog
  onDeleteDialogKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onCancelDelete();
      return;
    }

    if (event.key !== 'Tab') return;

    const dialog = this.deleteDialog()?.nativeElement;
    if (!dialog) return;

    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    if (!buttons.length) return;

    const first = buttons[0];
    const last = buttons[buttons.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // DELETE ONLY AFTER EXPLICIT CONFIRMATION

  async onConfirmDelete() {
    const listing = this.deleteTarget();
    if (!listing || this.isDeleting() || this.isUploading()) return;

    this.isDeleting.set(true);
    this.deleteErrorMessage.set('');

    try {
      const { error } = await this.listingService.deleteListing(listing.id);

      if (error) {
        console.error('Error deleting listing:', error);
        this.deleteErrorMessage.set('Could not delete listing. Please try again.');
        return;
      }

      // Database deletion succeeded; clean up the image afterward.
      if (listing.image_path) {
        const { error: imageError } = await this.listingService.deleteListingImage(
          listing.image_path,
        );
        if (imageError) {
          console.error('Error deleting listing image:', imageError);
        }
      }

      if (this.editingListing()?.id === listing.id) {
        this.editingListing.set(null);
        this.isModalOpen.set(false);
      }

      this.deleteTarget.set(null);
      this.deleteTrigger = null;
      this.pageSuccessMessage.set('Your listing has been deleted.');
      await this.loadListings();
    } catch (error) {
      console.error('Unexpected error deleting listing:', error);
      this.deleteErrorMessage.set('Something went wrong. Please try again.');
    } finally {
      this.isDeleting.set(false);
    }
  }

  // INITIAL LOAD
  ngOnInit() {
    void this.loadListings();
  }

  // MARK LISTING AS SOLD
  async onMarkAsSold(listing: Listing) {
    if (
      listing.status !== 'published' ||
      this.isUploading() ||
      this.isDeleting() ||
      this.isMarkingSold()
    ) {
      return;
    }

    this.isMarkingSold.set(true);
    this.soldErrorMessage.set('');

    try {
      const { error } = await this.listingService.updateListing(listing.id, {
        status: 'sold',
      });

      if (error) {
        console.error('Could not mark listing as sold:', error);
        this.soldErrorMessage.set('Could not mark this listing as sold. Please try again.');
        return;
      }

      await this.loadListings();
      this.pageSuccessMessage.set('Your listing has been marked as sold!');
    } catch (error) {
      console.error('Unexpected error marking listing as sold:', error);
      this.soldErrorMessage.set('Something went wrong. Please try again.');
    } finally {
      this.isMarkingSold.set(false);
    }
  }

  onStatusDialogKeydown(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;
    const dialog = this.statusDialog()?.nativeElement;
    if (!dialog) return;

    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));

    if (!buttons.length) {
      event.preventDefault();
      return;
    }

    const first = buttons[0];
    const last = buttons[buttons.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === first || document.activeElement === dialog) {
        event.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // MARK SOLD LISTING AS AVAILABLE
  async onMarkAsAvailable(listing: Listing) {
    if (
      listing.status !== 'sold' ||
      this.isUploading() ||
      this.isDeleting() ||
      this.isMarkingSold()
    ) {
      return;
    }

    this.isMarkingSold.set(true);
    this.soldErrorMessage.set('');

    try {
      const { error } = await this.listingService.updateListing(listing.id, {
        status: 'published',
      });

      if (error) {
        console.error('Could not make listing available:', error);
        this.soldErrorMessage.set('Could not make this listing available. Please try again.');
        return;
      }

      await this.loadListings();
      this.pageSuccessMessage.set('Your listing is available again!');
    } catch (error) {
      console.error('Unexpected error updating listing:', error);
      this.soldErrorMessage.set('Something went wrong. Please try again.');
    } finally {
      this.isMarkingSold.set(false);
    }
  }

  async confirmStatusChange() {
    const listing = this.statusChangeTarget();
    const status = this.statusChangeTo();

    if (!listing || !status || this.isMarkingSold()) return;

    if (status === 'sold') {
      await this.onMarkAsSold(listing);
    } else {
      await this.onMarkAsAvailable(listing);
    }

    if (!this.soldErrorMessage()) {
      this.closeStatusConfirmation();
    }
  }

  // LOAD SELLER LISTINGS
  async loadListings() {
    const { data: userData, error: userError } = await this.supabase.auth.getUser();

    if (userError || !userData.user) {
      console.error('Could not get authenticated user:', userError);
      return;
    }

    this.currentSellerId.set(userData.user.id);

    const { data, error } = await this.listingService.getListingsBySeller(userData.user.id);

    if (error) {
      console.error('Could not load listings:', error);
      return;
    }

    this.listings.set(data as Listing[]);

    console.log('My listings:', this.listings());
  }
}
