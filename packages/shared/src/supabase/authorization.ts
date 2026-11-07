import {supabase} from './client';

/** Pin this request's identity; never let SDK token lookup switch its owner. */
export async function authorizationForOwner(userId: string, message: string = 'Sign in again to continue.'): Promise<string> {
 const {data, error} = await supabase.auth.getSession();
 if (error || data.session?.user.id !== userId || !data.session.access_token) throw new Error(message);
 return `Bearer ${data.session.access_token}`;
}
