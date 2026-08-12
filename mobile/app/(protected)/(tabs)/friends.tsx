import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { useFriends, type Person } from "@/lib/use-friends";
import { useContactActions, useContactState } from "@/lib/use-contact-actions";
import { languageLabel } from "@/lib/languages";
import { Button } from "@/components/ui/button";

export default function Friends() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { friends, received, sent, isLoading, error, refetch, term, setTerm, results, searchLoading } = useFriends();

  const searching = term.trim().length >= 2;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView contentContainerClassName="gap-6 px-4 pb-8 pt-2">
        <Text className="text-[22px] font-bold text-foreground">Amis</Text>

        <View className="flex-row items-center gap-2 rounded-3xl border border-border bg-secondary px-4 py-3">
          <Text className="text-muted-foreground">🔍</Text>
          <TextInput
            value={term}
            onChangeText={setTerm}
            placeholder="Rechercher un profil"
            placeholderTextColor="#9598a4"
            autoCapitalize="none"
            className="flex-1 text-[15px] text-foreground"
          />
        </View>

        {searching ? (
          <Section title="Résultats">
            {searchLoading ? (
              <ActivityIndicator color="#9598a4" />
            ) : results.length === 0 ? (
              <Text className="px-1 text-[13px] text-muted-foreground">Aucun résultat.</Text>
            ) : (
              results.map((person) => (
                <ContactRow key={person.id} person={person} userId={userId} onChanged={refetch} />
              ))
            )}
          </Section>
        ) : null}

        {received.length > 0 ? (
          <Section title="Demandes reçues">
            {received.map((request) => (
              <RequestRow key={request.id} request={request} userId={userId} onChanged={refetch} />
            ))}
          </Section>
        ) : null}

        {sent.length > 0 ? (
          <Section title="Demandes envoyées">
            {sent.map((request) => (
              <PersonRow key={request.id} person={request.profile}>
                <View className="rounded-2xl bg-secondary px-3 py-2">
                  <Text className="text-[12px] font-semibold text-muted-foreground">En attente</Text>
                </View>
              </PersonRow>
            ))}
          </Section>
        ) : null}

        <Section title="Mes amis">
          {isLoading ? (
            <View className="h-[72px] animate-pulse rounded-3xl bg-card" />
          ) : error ? (
            <View className="items-center rounded-3xl border border-border bg-card p-5">
              <Text className="mb-3 text-center text-[13px] text-muted-foreground">
                Impossible de charger vos amis.
              </Text>
              <Button label="Réessayer" variant="secondary" onPress={() => refetch()} />
            </View>
          ) : friends.length === 0 ? (
            <Text className="px-1 text-[13px] text-muted-foreground">
              Aucun ami pour l'instant — cherchez un profil ci-dessus pour envoyer une demande.
            </Text>
          ) : (
            friends.map((friend) => <FriendRow key={friend.id} friend={friend} userId={userId} />)
          )}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </Text>
      <View className="gap-2">{children}</View>
    </View>
  );
}

function PersonRow({ person, children }: { person: Person | null; children: React.ReactNode }) {
  const name = person?.username ?? "Utilisateur";
  return (
    <View className="flex-row items-center gap-3 rounded-3xl border border-border bg-card p-3">
      <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary">
        <Text className="text-[15px] font-bold text-primary-foreground">{name.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-semibold text-foreground">
          {name}
        </Text>
        <Text className="text-[12px] text-muted-foreground">{languageLabel(person?.primary_language)}</Text>
      </View>
      <View className="flex-row items-center gap-2">{children}</View>
    </View>
  );
}

function FriendRow({ friend, userId }: { friend: Person; userId: string | null }) {
  const { openChat, busy } = useContactActions(userId, friend.id, () => undefined);
  return (
    <PersonRow person={friend}>
      <Pressable
        onPress={() => void openChat(friend.username)}
        disabled={busy}
        className={`rounded-2xl bg-primary px-4 py-2.5 ${busy ? "opacity-50" : ""}`}
      >
        <Text className="text-[13px] font-semibold text-primary-foreground">
          {busy ? "…" : "Discuter"}
        </Text>
      </Pressable>
    </PersonRow>
  );
}

function RequestRow({
  request,
  userId,
  onChanged,
}: {
  request: { id: string; profile: Person | null };
  userId: string | null;
  onChanged: () => void;
}) {
  const { answer, busy } = useContactActions(userId, request.profile?.id ?? "", onChanged);
  return (
    <PersonRow person={request.profile}>
      <Pressable onPress={() => void answer(request.id, true)} disabled={busy} className="h-10 w-10 items-center justify-center rounded-2xl bg-primary">
        <Text className="text-[15px] text-primary-foreground">✓</Text>
      </Pressable>
      <Pressable onPress={() => void answer(request.id, false)} disabled={busy} className="h-10 w-10 items-center justify-center rounded-2xl bg-secondary">
        <Text className="text-[15px] text-muted-foreground">✕</Text>
      </Pressable>
    </PersonRow>
  );
}

function ContactRow({ person, userId, onChanged }: { person: Person; userId: string | null; onChanged: () => void }) {
  const { state, requestId, isLoading, refetch: refetchState } = useContactState(userId, person.id);
  const { add, answer, block, remove, openChat, busy } = useContactActions(userId, person.id, () => {
    void refetchState();
    onChanged();
  });

  if (isLoading) {
    return (
      <PersonRow person={person}>
        <ActivityIndicator size="small" color="#9598a4" />
      </PersonRow>
    );
  }

  return (
    <PersonRow person={person}>
      {state === "none" ? (
        <Pressable onPress={() => void add()} disabled={busy} className="rounded-2xl bg-primary px-3 py-2">
          <Text className="text-[12px] font-semibold text-primary-foreground">Ajouter</Text>
        </Pressable>
      ) : null}

      {state === "sent" ? (
        <View className="rounded-2xl bg-secondary px-3 py-2">
          <Text className="text-[12px] font-semibold text-muted-foreground">Envoyée</Text>
        </View>
      ) : null}

      {state === "received" ? (
        <>
          <Pressable onPress={() => void answer(requestId, true)} disabled={busy} className="h-9 w-9 items-center justify-center rounded-2xl bg-primary">
            <Text className="text-primary-foreground">✓</Text>
          </Pressable>
          <Pressable onPress={() => void answer(requestId, false)} disabled={busy} className="h-9 w-9 items-center justify-center rounded-2xl bg-secondary">
            <Text className="text-muted-foreground">✕</Text>
          </Pressable>
        </>
      ) : null}

      {state === "friends" ? (
        <>
          <Pressable onPress={() => void openChat(person.username)} disabled={busy} className="rounded-2xl bg-primary px-3 py-2">
            <Text className="text-[12px] font-semibold text-primary-foreground">Discuter</Text>
          </Pressable>
          <Pressable onPress={() => void remove()} disabled={busy} className="rounded-2xl bg-secondary px-3 py-2">
            <Text className="text-[12px] font-semibold text-destructive">Retirer</Text>
          </Pressable>
        </>
      ) : null}

      {state === "blocked" ? (
        <Pressable onPress={() => void block(false)} disabled={busy} className="rounded-2xl bg-secondary px-3 py-2">
          <Text className="text-[12px] font-semibold text-muted-foreground">Débloquer</Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => void block(true)} disabled={busy} className="h-9 w-9 items-center justify-center rounded-2xl bg-secondary">
          <Text className="text-[13px] text-muted-foreground">🚫</Text>
        </Pressable>
      )}
    </PersonRow>
  );
}
