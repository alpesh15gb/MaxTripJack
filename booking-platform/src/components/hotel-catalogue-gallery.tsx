'use client';
import { useState } from 'react';
import HotelGallery from './hotel-gallery';
import type { HotelCatalogueRecord } from '@/lib/hotel-catalogue';

export default function HotelCatalogueGallery({ hotel }: { hotel: Pick<HotelCatalogueRecord, 'name' | 'photos'> }) {
  const [open, setOpen] = useState(false);
  return <HotelGallery name={hotel.name} photos={hotel.photos} open={open} onOpenChange={setOpen} emptyDescription="See the supplied address and any listed amenities below, or contact our team for more details." />;
}
