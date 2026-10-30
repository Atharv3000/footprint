import time
import unittest
from server.battle import Battles


class BattleTests(unittest.TestCase):
    def setUp(self):
        self.b = Battles(); self.room = self.b.create('alice', 'Alice')
        self.b.join('bob', 'Bob', self.room.code)

    def start(self):
        self.b.set_ready('alice', True); self.b.set_ready('bob', True)
        self.room.start_at = time.time() - 1
        self.assertTrue(self.b.start(self.room))

    def test_bar_starts_in_middle_and_moves_one_step_each_way(self):
        self.assertEqual(self.room.snapshot()['host_share'], .5)
        self.start(); self.b.rep('alice')
        self.assertEqual(self.room.snapshot()['host_share'], .55)
        self.b.rep('bob'); self.assertEqual(self.room.snapshot()['host_share'], .5)

    def test_ten_rep_lead_wins_and_late_reps_cannot_reverse_winner(self):
        self.start()
        for _ in range(10): self.b.rep('alice')
        self.assertEqual(self.room.winner, 'alice')
        self.assertEqual(self.room.snapshot()['host_share'], 1)
        for _ in range(30): self.b.rep('bob')
        self.assertEqual(self.room.winner, 'alice'); self.assertEqual(self.room.counts['bob'], 0)

    def test_guest_can_win_at_opposite_endpoint(self):
        self.start()
        for _ in range(10): self.b.rep('bob')
        self.assertEqual(self.room.winner, 'bob'); self.assertEqual(self.room.snapshot()['host_share'], 0)

    def test_equal_reps_never_produce_a_winner(self):
        self.start()
        for _ in range(30): self.b.rep('alice'); self.b.rep('bob')
        self.assertIsNone(self.room.winner)
        self.assertEqual(self.room.snapshot()['host_share'], .5)

    def test_reps_before_countdown_finishes_do_not_count(self):
        self.b.rep('alice'); self.b.set_ready('alice', True); self.b.set_ready('bob', True)
        self.b.rep('bob'); self.assertFalse(self.b.start(self.room))
        self.assertEqual(self.room.counts, {'alice': 0, 'bob': 0})

    def test_third_player_and_double_join_rejected(self):
        with self.assertRaises(ValueError): self.b.join('charlie', 'C', self.room.code)
        with self.assertRaises(ValueError): self.b.create('alice', 'A')

    def test_disconnect_forfeits_only_an_active_battle(self):
        self.start(); self.b.leave('alice')
        self.assertEqual(self.room.winner, 'bob'); self.assertEqual(self.room.reason, 'opponent_left')
        self.b.leave('bob'); self.assertFalse(self.b.rooms)

    def test_countdown_departure_cancels_without_a_win(self):
        self.b.set_ready('alice', True); self.b.set_ready('bob', True); self.b.leave('alice')
        self.assertEqual(self.room.status, 'cancelled'); self.assertIsNone(self.room.winner)

    def test_unready_and_unknown_room(self):
        self.b.set_ready('alice', True); self.b.set_ready('alice', False)
        self.assertFalse(self.room.ready)
        with self.assertRaises(ValueError): self.b.join('c', 'C', 'NOTAROOM')


if __name__ == '__main__': unittest.main()
