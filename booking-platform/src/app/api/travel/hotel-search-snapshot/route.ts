import { z } from 'zod';
import { shoppingAccess } from '@/lib/guest-shopping';
import { body, sameOrigin, json, failure, HttpError } from '@/lib/http';
import { customerHotelSearchSnapshot } from '@/lib/hotel-search-snapshot';

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const {actor} = await shoppingAccess(request, 'detail');
    const {searchId} = await body(request, z.object({searchId: z.string().uuid()}).strict());
    return json(await customerHotelSearchSnapshot(searchId, actor));
  } catch (error) {
    return failure(error instanceof HttpError && error.status === 404
      ? new HttpError(409, 'This search is no longer available in this browser. Search again to continue.') : error);
  }
}
