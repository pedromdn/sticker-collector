import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadStickerHistory } from '$lib/server/collection';

function clean(value: FormDataEntryValue | null) {
	return String(value ?? '').trim();
}

export const load: PageServerLoad = async ({ locals: { supabase }, parent }) => {
	// group already comes from the root layout — reuse it instead of
	// querying it again. History is group-scoped so it still has to wait on
	// that, but it's streamed (not awaited) so it doesn't block the render.
	const { group } = await parent();
	return {
		history: group
			? loadStickerHistory(supabase, { groupId: group.id, members: group.members, limit: 60 })
			: Promise.resolve([])
	};
};

export const actions: Actions = {
	create: async ({ request, locals: { supabase, session, user } }) => {
		const form = await request.formData();
		const name = clean(form.get('name')) || 'Album compartido';
		const displayName = clean(form.get('display_name')) || user?.email || 'Yo';
		const locationLabel = clean(form.get('location_label')) || 'Misma ubicacion';
		const isSwapLocal = form.get('is_swap_local') === 'on';

		const { data: group, error: groupError } = await supabase
			.from('collection_groups')
			.insert({ name, created_by: session!.user.id })
			.select('id')
			.single();

		if (groupError) return fail(400, { error: 'No se pudo crear el grupo.' });

		const { error: memberError } = await supabase.from('group_members').insert({
			group_id: group.id,
			user_id: session!.user.id,
			display_name: displayName,
			location_label: locationLabel,
			is_swap_local: isSwapLocal
		});

		if (memberError) return fail(400, { error: 'No se pudo agregarte al grupo.' });
		redirect(303, '/grupo');
	},

	join: async ({ request, locals: { supabase, session, user } }) => {
		const form = await request.formData();
		const inviteCode = clean(form.get('invite_code')).toLowerCase();
		const displayName = clean(form.get('display_name')) || user?.email || 'Yo';
		const locationLabel = clean(form.get('location_label')) || 'Misma ubicacion';
		const isSwapLocal = form.get('is_swap_local') === 'on';

		const { error } = await supabase.rpc('join_group_by_code', {
			invite: inviteCode,
			display_name: displayName,
			location_label: locationLabel,
			is_swap_local: isSwapLocal
		});

		if (error) return fail(404, { error: 'No encontramos ese codigo.' });
		redirect(303, '/grupo');
	},

	profile: async ({ request, locals: { supabase, session } }) => {
		const form = await request.formData();
		const groupId = clean(form.get('group_id'));
		const displayName = clean(form.get('display_name')) || 'Yo';
		const locationLabel = clean(form.get('location_label')) || 'Misma ubicacion';
		const isSwapLocal = form.get('is_swap_local') === 'on';

		const { error } = await supabase
			.from('group_members')
			.update({
				display_name: displayName,
				location_label: locationLabel,
				is_swap_local: isSwapLocal
			})
			.eq('group_id', groupId)
			.eq('user_id', session!.user.id);

		if (error) return fail(400, { error: 'No se pudo guardar tu perfil.' });
		redirect(303, '/grupo');
	},

	leave: async ({ request, locals: { supabase, session } }) => {
		const form = await request.formData();
		const groupId = clean(form.get('group_id'));
		const { error } = await supabase
			.from('group_members')
			.delete()
			.eq('group_id', groupId)
			.eq('user_id', session!.user.id);

		if (error) return fail(400, { error: 'No se pudo salir del grupo.' });
		redirect(303, '/grupo');
	}
};
