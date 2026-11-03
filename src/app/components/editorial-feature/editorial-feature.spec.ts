import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EditorialFeature } from './editorial-feature';

describe('EditorialFeature', () => {
  let component: EditorialFeature;
  let fixture: ComponentFixture<EditorialFeature>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorialFeature],
    }).compileComponents();

    fixture = TestBed.createComponent(EditorialFeature);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
