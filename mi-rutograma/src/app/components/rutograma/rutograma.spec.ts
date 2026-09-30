import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RutogramaComponent } from './rutograma';

describe('Rutograma', () => {
  let component: RutogramaComponent;
  let fixture: ComponentFixture<RutogramaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RutogramaComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RutogramaComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
