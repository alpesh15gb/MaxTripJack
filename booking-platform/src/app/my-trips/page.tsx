import BookingWorkspace from "@/components/booking-workspace";
export default async function TripsPage({searchParams}: PageProps<'/my-trips'>){
  const {lookup}=await searchParams;
  return <BookingWorkspace openFlightLookup={lookup==='flight'}/>;
}
