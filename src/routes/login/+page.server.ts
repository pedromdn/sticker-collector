import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, locals: { supabase }, url }) => {
		const formData = await request.formData();
		const email = formData.get('email');

		if (typeof email !== 'string' || !email.includes('@')) {
			return fail(400, { error: 'Ingresa un correo válido.', email: String(email ?? '') });
		}

		const { error } = await supabase.auth.signInWithOtp({
			email,
			options: {
				emailRedirectTo: `${url.origin}/auth/callback`
			}
		});

		if (error) {
			console.error('signInWithOtp error:', error.status, error.code, error.message);
			return fail(500, { error: `No pudimos enviar el enlace: ${error.message}`, email });
		}

		return { sent: true, email };
	}
};
